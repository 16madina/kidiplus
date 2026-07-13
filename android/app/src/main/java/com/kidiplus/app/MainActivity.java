package com.kidiplus.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    private static final String PUSH_CHANNEL_ID = "kidiplus_default";
    private boolean pipEligible = false;

    /**
     * Injected into the WebView BEFORE entering system PiP.
     * Android shows the entire WebView in the bubble — if we wait for React,
     * the first frames still show Accueil/tabs under a mini live. Force the
     * live shell edge-to-edge + a black mask immediately (works even before
     * the next web deploy by walking up from &lt;video&gt; to a fixed ancestor).
     */
    private static final String PREPARE_PIP_JS =
        "(function(){try{"
            + "var h=document.documentElement;"
            + "h.classList.add('kp-in-system-pip');"
            + "h.style.background='#000';"
            + "if(document.body)document.body.style.background='#000';"
            + "var st=document.getElementById('kp-pip-force-style');"
            + "if(!st){st=document.createElement('style');st.id='kp-pip-force-style';"
            + "h.appendChild(st);}"
            + "st.textContent="
            + "'html.kp-in-system-pip,html.kp-in-system-pip body{background:#000!important}"
            + "html.kp-in-system-pip [data-kp-shell-chrome],"
            + "html.kp-in-system-pip .kp-pip-hide{"
            + "visibility:hidden!important;opacity:0!important;pointer-events:none!important}"
            + "html.kp-in-system-pip [data-kp-live-pip],"
            + "html.kp-in-system-pip .kp-pip-live-target{"
            + "position:fixed!important;inset:0!important;top:0!important;right:0!important;"
            + "bottom:0!important;left:0!important;width:100vw!important;height:100vh!important;"
            + "max-width:none!important;margin:0!important;transform:none!important;"
            + "border-radius:0!important;z-index:2147483000!important;overflow:hidden!important;"
            + "background:#000!important}'"
            + ";"
            + "var shells=document.querySelectorAll('[data-kp-live-pip]');"
            + "if(!shells.length){"
            + "var v=document.querySelector('video');"
            + "if(v){var n=v.parentElement;while(n&&n!==document.body){"
            + "var cs=window.getComputedStyle(n);"
            + "if(cs.position==='fixed'){n.classList.add('kp-pip-live-target');break;}"
            + "n=n.parentElement;}}}"
            + "var mask=document.getElementById('kp-pip-mask');"
            + "if(!mask&&document.body){mask=document.createElement('div');mask.id='kp-pip-mask';"
            + "mask.setAttribute('aria-hidden','true');"
            + "mask.style.cssText='position:fixed;inset:0;background:#000;z-index:2147482990;pointer-events:none';"
            + "document.body.appendChild(mask);}"
            + "window.dispatchEvent(new CustomEvent('kidi:pip-prepare'));"
            + "}catch(e){}})();";

    private static final String CLEAR_PIP_JS =
        "(function(){try{"
            + "var h=document.documentElement;"
            + "h.classList.remove('kp-in-system-pip');"
            + "h.style.background='';"
            + "if(document.body)document.body.style.background='';"
            + "var st=document.getElementById('kp-pip-force-style');if(st)st.remove();"
            + "var mask=document.getElementById('kp-pip-mask');if(mask)mask.remove();"
            + "document.querySelectorAll('.kp-pip-live-target').forEach(function(el){"
            + "el.classList.remove('kp-pip-live-target');});"
            + "}catch(e){}})();";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before super.onCreate.
        registerPlugin(PipPlugin.class);
        super.onCreate(savedInstanceState);
        createDefaultNotificationChannel();
        WebSettings settings = this.bridge.getWebView().getSettings();
        // Allow splash (and other) media to autoplay with sound — no tap required.
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Transparent default video poster so Android never flashes a big play icon.
        this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public Bitmap getDefaultVideoPoster() {
                Bitmap bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);
                canvas.drawARGB(0, 0, 0, 0);
                return bitmap;
            }
        });
    }

    public void setPipEligible(boolean eligible) {
        this.pipEligible = eligible;
        // Android 12+: declare auto-enter so Home/gesture leave enters PiP
        // without relying solely on onUserLeaveHint (unreliable on some OEMs).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                setPictureInPictureParams(buildParams(eligible));
            } catch (IllegalStateException ignored) {
                /* activity not ready */
            }
        }
    }

    /** Hide tabs / force live fullscreen in the WebView before the OS captures PiP. */
    public void preparePipUi() {
        evalJs(PREPARE_PIP_JS);
    }

    public void clearPipUi() {
        evalJs(CLEAR_PIP_JS);
    }

    private void evalJs(String js) {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        try {
            webView.evaluateJavascript(js, null);
        } catch (RuntimeException ignored) {
            /* WebView not ready */
        }
    }

    public boolean enterPipMode() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        if (isInPictureInPictureMode()) return true;
        if (!getPackageManager().hasSystemFeature(
                android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            return false;
        }
        preparePipUi();
        try {
            return enterPictureInPictureMode(buildParams(true));
        } catch (IllegalStateException e) {
            // Activity not in a valid state to enter PiP.
            return false;
        }
    }

    private static PictureInPictureParams buildParams(boolean autoEnter) {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder()
            .setAspectRatio(new Rational(9, 16));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            b.setAutoEnterEnabled(autoEnter);
            b.setSeamlessResizeEnabled(true);
        }
        return b.build();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (!pipEligible) return;
        // Always prepare UI before the system (or we) enter PiP — including
        // Android 12+ auto-enter, which otherwise captures home/tabs first.
        preparePipUi();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            enterPipMode();
        }
    }

    @Override
    public void onPause() {
        if (pipEligible && !isInPictureInPictureMode()) {
            preparePipUi();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                && !isChangingConfigurations()) {
                enterPipMode();
            }
        }
        super.onPause();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        }
        if (isInPictureInPictureMode) {
            preparePipUi();
        } else {
            clearPipUi();
        }
        notifyPipPlugin(isInPictureInPictureMode);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            if (isInPictureInPictureMode) {
                preparePipUi();
            } else {
                clearPipUi();
            }
            notifyPipPlugin(isInPictureInPictureMode);
        }
    }

    private void notifyPipPlugin(boolean active) {
        if (this.bridge == null) return;
        PluginHandle handle = this.bridge.getPlugin("LivePip");
        if (handle == null) return;
        if (handle.getInstance() instanceof PipPlugin) {
            ((PipPlugin) handle.getInstance()).notifyModeChanged(active);
        }
    }

    private void createDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            PUSH_CHANNEL_ID,
            "KiDi+",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Lives, messages et alertes KiDi+");
        manager.createNotificationChannel(channel);
    }
}
