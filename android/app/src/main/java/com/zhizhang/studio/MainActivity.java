package com.zhizhang.studio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * 接了实体键盘时，点输入框仍会弹出虚拟软键盘。原生侧想直接拦（hideSoftInputFromWindow、
 * SOFT_INPUT_STATE_ALWAYS_HIDDEN 之类）会把 IME 会话和候选词一起收掉，实体键盘的中文输入
 * 就废了；这一层只负责把「有没有实体键盘」告诉网页（HardwareKeyboardPlugin），
 * 由网页给当前可编辑元素加 inputmode="none" —— 软键盘不弹，InputConnection 与候选词照常。
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(HardwareKeyboardPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
