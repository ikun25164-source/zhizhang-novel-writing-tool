package com.zhizhang.studio;

import android.content.res.Configuration;
import android.hardware.input.InputManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * 接了实体键盘时不再自动弹软键盘：软键盘会盖住正文并抢走方向键，而这时输入本来就走实体键盘。
 * WebView 上没有可用的 setShowSoftInputOnFocus，所以监听 WindowInsets 的 ime 可见性，一出现就收起。
 */
public class MainActivity extends BridgeActivity {
    private boolean suppressing = false;
    private long lastHideAt = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        watchIme();
        applyKeyboardPolicy();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyKeyboardPolicy();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyKeyboardPolicy();
    }

    private void watchIme() {
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            if (suppressing && insets.isVisible(WindowInsetsCompat.Type.ime())
                    && System.currentTimeMillis() - lastHideAt > 250) {
                lastHideAt = System.currentTimeMillis();
                hideIme(v);
                // IME 有入场动画，隔一帧再收一次，避免只收起一半
                v.postDelayed(() -> hideIme(v), 120);
            }
            return ViewCompat.onApplyWindowInsets(v, insets);
        });
    }

    private void hideIme(View v) {
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(v.getWindowToken(), 0);
        if (ViewCompat.getWindowInsetsController(v) != null) {
            ViewCompat.getWindowInsetsController(v).hide(WindowInsetsCompat.Type.ime());
        }
    }

    /**
     * 厂商实现不统一：这台 OPPO 接蓝牙键盘时 Configuration.keyboard 仍报 NOKEYS，
     * getKeyboardType() 也只报成非字母键盘，所以按「外接 / 能出字母键的非虚拟键盘」逐个设备判断，
     * 音量键、电源键那类内置键盘不会命中。注意不能中途 return，否则永远只看到第一个键盘设备。
     */
    private boolean hasHardwareKeyboard() {
        InputManager input = (InputManager) getSystemService(INPUT_SERVICE);
        if (input == null) return false;
        for (int id : input.getInputDeviceIds()) {
            InputDevice device = input.getInputDevice(id);
            if (device == null || device.isVirtual()) continue;
            if ((device.getSources() & InputDevice.SOURCE_KEYBOARD) == 0) continue;
            boolean external = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && device.isExternal();
            if (external || device.getKeyboardType() == InputDevice.KEYBOARD_TYPE_ALPHABETIC || hasLetterKeys(device)) {
                Log.i("ZhizhangIME", "hardware keyboard: " + device.getName());
                return true;
            }
        }
        return false;
    }

    private boolean hasLetterKeys(InputDevice device) {
        boolean[] keys = device.hasKeys(KeyEvent.KEYCODE_A, KeyEvent.KEYCODE_Z);
        return keys.length >= 2 && keys[0] && keys[1];
    }

    private void applyKeyboardPolicy() {
        suppressing = hasHardwareKeyboard();
        getWindow().setSoftInputMode(suppressing
                ? WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN
                : WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED);
        if (suppressing) {
            View decor = getWindow().getDecorView();
            decor.postDelayed(() -> hideIme(decor), 60);
        }
    }
}
