package com.zhizhang.studio;

import com.getcapacitor.BridgeActivity;

/**
 * 接了实体键盘时，「点一下输入框就自动弹出虚拟软键盘」这件事没法在原生侧拦下来。
 *
 * 唯一不伤输入的开关是 View#setShowSoftInputOnFocus(false)（InputConnection 保持存活，
 * 硬件按键与候选词照常），但 OPPO 这台 WebView 的整条继承链上都没有这个方法（实测反射找不到）。
 * 剩下的手段——hideSoftInputFromWindow、SOFT_INPUT_STATE_ALWAYS_HIDDEN、按 WindowInsets
 * 强制收起——都会连 IME 会话和候选词窗口一起干掉，实体键盘的中文输入直接废掉，
 * 属于「不要一刀切」的反面例子，所以这里什么都不做。
 *
 * 网页侧改用布局判断：软键盘真的占掉高度时（html[data-keyboard="open"]）让字数状态栏和
 * 面板底边让位给正文，键盘该不该弹由用户自己决定。
 */
public class MainActivity extends BridgeActivity {
}
