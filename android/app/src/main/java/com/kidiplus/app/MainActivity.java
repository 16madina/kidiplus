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
     *
     * Important: do NOT append a full-screen mask to document.body — the app
     * shell uses isolation:isolate, so a body-level mask paints ABOVE the live
     * and the PiP bubble goes fully black. Only toggle the class + expand the
     * fixed live ancestor; CSS inside the shell hides Accueil/tabs.
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
            + "html.kp-in-system-pip [data-kp-shell-chrome]{"
            + "visibility:hidden!important;opacity:0!important;pointer-events:none!important}"
            + "html.kp-in-system-pip [data-kp-live-pip],"
            + "html.kp-in-system-pip .kp-pip-live-target{"
            + "position:fixed!important;inset:0!important;top:0!important;right:0!important;"
            + "bottom:0!important;left:0!important;width:100vw!important;height:100vh!important;"
            + "max-width:none!important;margin:0!important;transform:none!important;"
            + "border-radius:0!important;z-index:2147483000!important;overflow:hidden!important;"
            + "background:#000!important}'"
            + ";"
            + "if(!document.querySelector('[data-kp-live-pip]')){"
            + "var v=document.querySelector('video');"
            + "if(v){var n=v.parentElement;while(n&&n!==document.body){"
            + "var cs=window.getComputedStyle(n);"
            + "if(cs.position==='fixed'){n.classList.add('kp-pip-live-target');break;}"
            + "n=n.parentElement;}}}"
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
            + "window.dispatchEvent(new CustomEvent('kidi:pip-clear'));"
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

    /**
     * Close the system PiP bubble (host ended live, or viewer closed the live).
     * Android has no exitPictureInPictureMode(); finishing while in PiP dismisses
     * the bubble. Next cold start of the app is a normal MainActivity launch.
     */
    public boolean dismissPip() {
        setPipEligible(false);
        clearPipUi();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()) {
            try {
                finish();
                return true;
            } catch (RuntimeException ignored) {
                return false;
            }
        }
        return false;
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
        // Prepare only when the user is leaving the app (Home / recents).
        preparePipUi();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            enterPipMode();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Always clear PiP chrome lock when back in the foreground and not
        // actually in system PiP — otherwise Accueil stays hidden / X dead
        // until the host ends the live (JS flag can stick without a web deploy).
        if (!isInPictureInPictureMode()) {
            clearPipUi();
            notifyPipPlugin(false);
        }
    }

    @Override
    public void onPause() {
        // Pre-Android 12 only: enter PiP from onPause as a fallback.
        // Do NOT call preparePipUi on every pause on Android 12+ — notification
        // shade / brief pauses would lock the UI in "system PiP" mode (black
        // screen, no close button) without ever entering real PiP.
        if (pipEligible
            && !isInPictureInPictureMode()
            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            && !isChangingConfigurations()) {
            enterPipMode();
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
