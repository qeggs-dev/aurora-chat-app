package com.aurorachat.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 「检查更新」的 Android 原生下载 + 安装桥。
 *
 * - downloadApk：在独立线程里用 HttpURLConnection 匿名 GET（可走镜像），写入应用 cache/updates，
 *   通过 downloadProgress 事件回报进度；可以 cancelDownload 取消；
 * - installApk：只接受 cache 目录内的 APK，用 FileProvider 的 content:// URI + ACTION_VIEW 打开
 *   系统安装器，用户仍需手动确认；没有「安装未知应用」权限时返回 permission 错误；
 * - nativeFetch：给 web 层做 Release API 的匿名 GET（绕开 WebView CORS），复用同一套 URL 白名单；
 * - getBuildInfo：返回 BuildConfig.DEBUG / VERSION_NAME / 安装权限，供 web 层选 debug 还是 release APK。
 *
 * 安全约束：只允许 https 的 GitHub 官方域名与代码内镜像白名单；请求头不带任何凭据；
 * 文件名白名单；下载上限 300MB；安装只触发系统安装器，不做静默安装。
 */
@CapacitorPlugin(name = "UpdateInstaller")
public class UpdateInstallerPlugin extends Plugin {

    private static final String LOG_TAG = "UpdateInstaller";
    private static final long MAX_DOWNLOAD_BYTES = 300L * 1024L * 1024L;
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 20000;
    private static final long PROGRESS_INTERVAL_MS = 150L;

    private static final Set<String> CONTENT_HOSTS = new HashSet<>(Arrays.asList(
            "github.com",
            "api.github.com",
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com"
    ));

    /** 与 web/src/services/update/github.ts 的 GITHUB_MIRRORS 保持一致（只用于匿名 GET） */
    private static final Set<String> MIRROR_HOSTS = new HashSet<>(Arrays.asList(
            "cors.isteed.cc",
            "fastgit.cc",
            "githubproxy.gohj99.site",
            "gh-proxy.com",
            "gh.noki.icu",
            "gh-proxy.org",
            "ghproxy.net",
            "ghfast.top",
            "github.chenc.dev",
            "github.xxlab.tech"
    ));

    private static final String FILE_NAME_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._+-]{0,180}$";

    private volatile boolean cancelled = false;
    private volatile Thread worker = null;

    /** 只接受 https + GitHub 官方内容域名，且 URL 里不能夹带凭据 */
    private static boolean isAllowedContentUrl(String value) {
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null) {
                return false;
            }
            return CONTENT_HOSTS.contains(uri.getHost());
        } catch (Exception error) {
            return false;
        }
    }

    /** 直连地址，或「镜像前缀 + 官方地址」才放行 */
    private static boolean isAllowedRequestUrl(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        if (isAllowedContentUrl(value)) {
            return true;
        }
        int index = value.indexOf("/https://");
        if (index <= 0) {
            return false;
        }
        String origin = value.substring(0, index);
        String target = value.substring(index + 1);
        try {
            URI uri = new URI(origin);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null) {
                return false;
            }
            if (!MIRROR_HOSTS.contains(uri.getHost())) {
                return false;
            }
        } catch (Exception error) {
            return false;
        }
        return isAllowedContentUrl(target);
    }

    private HttpURLConnection openConnection(String url, String accept) throws IOException {
        URL parsed = new URL(url);
        HttpURLConnection connection = (HttpURLConnection) parsed.openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        // 匿名请求：不设置 Authorization / Cookie
        connection.setRequestProperty("Accept", accept);
        connection.setRequestProperty("User-Agent", "Aurora-Chat/" + appVersionName() + " (Android update)");
        return connection;
    }

    /** 版本名取 PackageManager（不依赖 AGP 的 BuildConfig 生成开关） */
    private String appVersionName() {
        try {
            return getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0)
                    .versionName;
        } catch (Exception error) {
            return "";
        }
    }

    /** 调试包判定：debug 签名安装的包只能被同签名 debug 包覆盖 */
    private boolean isDebuggableBuild() {
        return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;
        }
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void notifyDownloadProgress(long received, long total) {
        int percent = total > 0 ? (int) Math.min(100L, (received * 100L) / total) : 0;
        JSObject data = new JSObject();
        data.put("received", received);
        data.put("total", total);
        data.put("percent", percent);
        notifyListeners("downloadProgress", data);
    }

    private static boolean deleteQuietly(File file) {
        if (file == null) {
            return false;
        }
        try {
            return file.delete();
        } catch (Exception error) {
            return false;
        }
    }

    /** 构建渠道 / 版本 / 安装权限：web 层据此选 debug 还是 release APK */
    @PluginMethod
    public void getBuildInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("debug", isDebuggableBuild());
        result.put("versionName", appVersionName());
        result.put("installPermission", canInstallPackages());
        call.resolve(result);
    }

    /** Release API 的匿名 GET：返回状态码、响应体与限流头，由 web 层统一解析/分类 */
    @PluginMethod
    public void nativeFetch(PluginCall call) {
        String url = call.getString("url", "");
        if (!isAllowedRequestUrl(url)) {
            call.reject("blocked update request url", "network");
            return;
        }
        HttpURLConnection connection = null;
        try {
            connection = openConnection(url, "application/vnd.github+json");
            int status = connection.getResponseCode();
            InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (input != null) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) > 0) {
                    output.write(buffer, 0, read);
                    if (output.size() > MAX_RESPONSE_BYTES) {
                        input.close();
                        call.reject("update response too large", "invalid-response");
                        return;
                    }
                }
                input.close();
            }
            JSObject result = new JSObject();
            result.put("status", status);
            result.put("text", output.toString("UTF-8"));
            String contentType = connection.getContentType();
            result.put("contentType", contentType == null ? "" : contentType);
            result.put("rateLimitRemaining", connection.getHeaderField("x-ratelimit-remaining"));
            result.put("retryAfter", connection.getHeaderField("retry-after"));
            call.resolve(result);
        } catch (IOException error) {
            call.reject("network error: " + error.getMessage(), "network");
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    /** 下载 APK 到 cache/updates；在独立线程执行，避免占住 Capacitor 插件线程 */
    @PluginMethod
    public void downloadApk(PluginCall call) {
        List<String> candidates = new ArrayList<>();
        JSArray array = call.getArray("candidates");
        if (array != null) {
            for (int index = 0; index < array.length(); index += 1) {
                try {
                    String url = array.getString(index);
                    if (url != null && isAllowedRequestUrl(url)) {
                        candidates.add(url);
                    }
                } catch (Exception ignored) {
                    // 单个候选格式不对就跳过
                }
            }
        }
        String fileName = call.getString("fileName", "");
        // 注意：PluginCall.getLong 只接受 Long 类型的值，JSON 整数（如 9468616）会解析成 Integer，
        // 直接 getLong 会拿到默认值 0。这里从 data 里按 Number 取值（只赋值一次，lambda 可捕获）。
        Object rawExpected = call.getData().opt("expectedSize");
        long expectedSize = rawExpected instanceof Number ? ((Number) rawExpected).longValue() : 0L;
        if (candidates.isEmpty() || fileName == null || !fileName.matches(FILE_NAME_PATTERN)) {
            call.reject("invalid download request", "download-failed");
            return;
        }
        if (expectedSize <= 0 || expectedSize > MAX_DOWNLOAD_BYTES) {
            call.reject("invalid expected size", expectedSize > MAX_DOWNLOAD_BYTES ? "too-large" : "download-failed");
            return;
        }
        if (worker != null && worker.isAlive()) {
            call.reject("another download is already running", "download-failed");
            return;
        }
        cancelled = false;
        File directory = new File(getContext().getCacheDir(), "updates");
        if (!directory.exists() && !directory.mkdirs()) {
            call.reject("cannot create update cache directory", "download-failed");
            return;
        }
        File target = new File(directory, fileName);
        Thread thread = new Thread(() -> runDownload(call, candidates, target, expectedSize), "aurora-update-download");
        worker = thread;
        thread.start();
    }

    private boolean isCancelled() {
        return cancelled || Thread.currentThread().isInterrupted();
    }

    private void runDownload(PluginCall call, List<String> candidates, File target, long expectedSize) {
        File partial = new File(target.getPath() + ".part");
        deleteQuietly(partial);
        String lastError = "no candidate";
        byte[] buffer = new byte[64 * 1024];
        for (String url : candidates) {
            if (isCancelled()) {
                deleteQuietly(partial);
                call.reject("download cancelled", "cancelled");
                return;
            }
            HttpURLConnection connection = null;
            long received = 0L;
            try {
                Logger.info(LOG_TAG, "downloadApk start: " + url);
                connection = openConnection(url, "application/octet-stream");
                int status = connection.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK) {
                    lastError = "HTTP " + status;
                    Logger.warn(LOG_TAG, "downloadApk candidate failed: " + lastError);
                    continue;
                }
                String contentType = connection.getContentType();
                if (contentType != null && contentType.toLowerCase().contains("text/html")) {
                    lastError = "mirror returned html";
                    Logger.warn(LOG_TAG, "downloadApk candidate failed: " + lastError);
                    continue;
                }
                long contentLength = connection.getContentLengthLong();
                if (contentLength > MAX_DOWNLOAD_BYTES) {
                    call.reject("installer exceeds the download limit", "too-large");
                    return;
                }
                long total = expectedSize > 0 ? expectedSize : contentLength;
                long lastProgress = 0L;
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(partial)) {
                    int read;
                    while ((read = input.read(buffer)) > 0) {
                        if (isCancelled()) {
                            deleteQuietly(partial);
                            call.reject("download cancelled", "cancelled");
                            return;
                        }
                        received += read;
                        if (received > MAX_DOWNLOAD_BYTES) {
                            deleteQuietly(partial);
                            call.reject("installer exceeds the download limit", "too-large");
                            return;
                        }
                        output.write(buffer, 0, read);
                        long now = System.currentTimeMillis();
                        if (now - lastProgress >= PROGRESS_INTERVAL_MS) {
                            lastProgress = now;
                            notifyDownloadProgress(received, total);
                        }
                    }
                }
                if (received != expectedSize) {
                    lastError = "size mismatch: " + received + " != " + expectedSize;
                    Logger.warn(LOG_TAG, "downloadApk candidate failed: " + lastError);
                    deleteQuietly(partial);
                    continue;
                }
                if (target.exists()) {
                    deleteQuietly(target);
                }
                if (!partial.renameTo(target)) {
                    lastError = "cannot move downloaded file into place";
                    deleteQuietly(partial);
                    continue;
                }
                notifyDownloadProgress(received, expectedSize);
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("bytes", received);
                Logger.info(LOG_TAG, "downloadApk ok: " + target.getAbsolutePath() + " (" + received + " bytes)");
                call.resolve(result);
                return;
            } catch (IOException error) {
                lastError = error.getMessage() == null ? error.toString() : error.getMessage();
                Logger.warn(LOG_TAG, "downloadApk candidate error: " + lastError);
                deleteQuietly(partial);
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }
        deleteQuietly(partial);
        call.reject("download failed: " + lastError, "download-failed");
    }

    /** 取消正在进行的下载；取消后 downloadApk 会以 cancelled 收尾 */
    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelled = true;
        Thread current = worker;
        if (current != null && current.isAlive()) {
            current.interrupt();
        }
        JSObject result = new JSObject();
        result.put("cancelled", true);
        call.resolve(result);
    }

    /** 用 FileProvider 的 content:// URI 拉起系统安装器（用户仍需手动确认） */
    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path", "");
        if (path == null || path.isEmpty()) {
            call.reject("apk path is required", "download-failed");
            return;
        }
        File file;
        try {
            file = new File(path).getCanonicalFile();
        } catch (IOException error) {
            call.reject("invalid apk path", "permission");
            return;
        }
        String cacheRoot;
        try {
            cacheRoot = getContext().getCacheDir().getCanonicalPath();
        } catch (IOException error) {
            call.reject("cannot resolve cache directory", "permission");
            return;
        }
        if (!file.getPath().startsWith(cacheRoot + File.separator)) {
            call.reject("only apks inside the app cache may be installed", "permission");
            return;
        }
        if (!file.isFile() || file.length() <= 0) {
            call.reject("apk file is missing", "download-failed");
            return;
        }
        if (!canInstallPackages()) {
            Logger.warn(LOG_TAG, "installApk denied: install unknown apps permission is off");
            call.reject("install permission is required", "permission");
            return;
        }
        getBridge().executeOnMainThread(() -> {
            try {
                Uri uri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        file
                );
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                Logger.info(LOG_TAG, "installApk opened installer for " + file.getAbsolutePath());
                JSObject result = new JSObject();
                result.put("opened", true);
                call.resolve(result);
            } catch (ActivityNotFoundException error) {
                Logger.error(LOG_TAG, "installApk failed: no package installer", error);
                call.reject("no package installer available", "unsupported");
            } catch (Exception error) {
                Logger.error(LOG_TAG, "installApk failed", error);
                call.reject("cannot open package installer: " + error.getMessage(), "download-failed");
            }
        });
    }
}
