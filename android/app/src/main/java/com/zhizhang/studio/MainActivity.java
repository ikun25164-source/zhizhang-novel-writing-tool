package com.zhizhang.studio;

import android.content.res.Configuration;
import android.graphics.Rect;
import android.hardware.input.InputManager;
import android.os.Build;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;

import com.getcapacitor.BridgeActivity;

/**
 * 接了实体键盘时不再自动弹软键盘：软键盘会抢走方向键，而写作场景本来就用实体键盘输入。
 * 两道保险：1) 关掉 WebView 的 focus 自动弹键盘；2) 万一还是弹了，检测到 IME 显示就立刻收起。
 */
public class MainActivity extends BridgeActivity {
    private boolean suppressing = false;
    private View decor;
    private final View.OnLayoutChangeListener imeWatcher =
            (v, l, t, r, b, ol, ot, or, ob) -> hideIfSuppressed();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyKeyboardPolicy();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyKeyboardPolicy();
        View root = getWebView();
        if (root != null) {
            decor = root.getRootView();
            decor.addOnLayoutChangeListener(imeWatcher);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        if (decor != null) {
            decor.removeOnLayoutChangeListener(imeWatcher);
            decor = null;
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyKeyboardPolicy();
    }

    private View getWebView() {
        if (getBridge() == null) return null;
        View view = getBridge().getWebView();
        return view == null ? findViewById(android.R.id.content) : view;
    }

    private boolean hasHardwareKeyboard() {
        if (getResources().getConfiguration().keyboard == Configuration.KEYBOARD_NOKEYS) return false;
        InputManager input = (InputManager) getSystemService(INPUT_SERVICE);
        if (input == null) return true;
        for (int id : input.getInputDeviceIds()) {
            InputDevice device = input.getInputDevice(id);
            if (device == null || device.isVirtual()) continue;
            if ((device.getSources() & InputDevice.SOURCE_KEYBOARD) == 0) continue;
            if (device.getKeyboardType() == InputDevice.KEYBOARD_TYPE_NONE) continue;
            return true;
        }
        return false;
    }

    private void applyKeyboardPolicy() {
        suppressing = hasHardwareKeyboard();
        getWindow().setSoftInputMode(suppressing
                ? WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN
                : WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED);
        View web = getWebView();
        if (web != null) {
            try {
                // WebView 上没有公开的 setShowSoftInputOnFocus，反射调用，失败则靠下面的布局监听兜底
                web.getClass().getMethod("setShowSoftInputOnFocus", boolean.class).invoke(web, !suppressing);
            } catch (Throwable ignored) {
                // 部分系统 / WebView 版本没有该方法
            }
        }
        if (suppressing) hideIfSuppressed();
    }

    private void hideIfSuppressed() {
        if (!suppressing) return;
        View web = getWebView();
        if (web == null) return;
        Rect visible = new Rect();
        web.getWindowVisibleDisplayFrame(visible);
        int height = web.getRootView().getHeight();
        boolean imeVisible = height - visible.bottom > 100;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsets insets = web.getRootWindowInsets();
            if (insets != null) imeVisible = insets.isVisible(WindowInsets.Type.ime()) || imeVisible;
        }
        if (!imeVisible) return;
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(web.getWindowToken(), 0);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && web.getWindowInsetsController() != null) {
            web.getWindowInsetsController().hide(WindowInsets.Type.ime());
        }
    }

}
