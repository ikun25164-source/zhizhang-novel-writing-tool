package com.zhizhang.studio;

import android.content.Context;
import android.hardware.input.InputManager;
import android.os.Handler;
import android.os.Looper;
import android.view.InputDevice;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 只回答一个问题：现在有没有接实体键盘。网页侧拿到 true 时给可编辑元素加 inputmode="none"，
 * 软键盘就不会在聚焦时弹出来，而 InputConnection 照常建立——输入法的硬件输入和候选词不受影响。
 *
 * 判定必须看输入设备而不是配置位：这台机器上 gpio-keys、触摸屏、耳机口都带 KEYBOARD 源，
 * 只有 KEYBOARD_TYPE_ALPHABETIC 才是真正的文字键盘（蓝牙键盘就在这里命中）。
 */
@CapacitorPlugin(name = "HardwareKeyboard")
public class HardwareKeyboardPlugin extends Plugin {

    private InputManager inputManager;

    private final InputManager.InputDeviceListener deviceListener = new InputManager.InputDeviceListener() {
        @Override
        public void onInputDeviceAdded(int deviceId) {
            push();
        }

        @Override
        public void onInputDeviceRemoved(int deviceId) {
            push();
        }

        @Override
        public void onInputDeviceChanged(int deviceId) {
            push();
        }
    };

    @Override
    public void load() {
        inputManager = (InputManager) getContext().getSystemService(Context.INPUT_SERVICE);
        inputManager.registerInputDeviceListener(deviceListener, new Handler(Looper.getMainLooper()));
    }

    @PluginMethod
    public void isAttached(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("attached", hasAlphabeticKeyboard());
        call.resolve(ret);
    }

    private void push() {
        JSObject ret = new JSObject();
        ret.put("attached", hasAlphabeticKeyboard());
        notifyListeners("change", ret);
    }

    private boolean hasAlphabeticKeyboard() {
        if (inputManager == null) return false;
        for (int id : inputManager.getInputDeviceIds()) {
            InputDevice device = inputManager.getInputDevice(id);
            if (device == null || device.isVirtual()) continue;
            if ((device.getSources() & InputDevice.SOURCE_KEYBOARD) == 0) continue;
            if (device.getKeyboardType() == InputDevice.KEYBOARD_TYPE_ALPHABETIC) return true;
        }
        return false;
    }

    @Override
    protected void handleOnDestroy() {
        if (inputManager != null) inputManager.unregisterInputDeviceListener(deviceListener);
        super.handleOnDestroy();
    }
}
