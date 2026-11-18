package com.aurorachat.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 本地插件必须在 super.onCreate 之前注册，Bridge 装配时才会加载
        registerPlugin(UpdateInstallerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
