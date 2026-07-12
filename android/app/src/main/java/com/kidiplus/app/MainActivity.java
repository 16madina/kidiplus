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
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    private static final String PUSH_CHANNEL_ID = "kidiplus_default";
    private boolean pipEligible = false;

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

    public boolean enterPipMode() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        if (isInPictureInPictureMode()) return true;
        if (!getPackageManager().hasSystemFeature(
                android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            return false;
        }
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
        // Pre-Android 12 fallback when auto-enter is unavailable.
        if (pipEligible
            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            enterPipMode();
        }
    }

    @Override
    protected void onPause() {
        // Extra fallback: some devices skip onUserLeaveHint when switching apps.
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
        notifyPipPlugin(isInPictureInPictureMode);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
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
