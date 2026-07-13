package com.kidiplus.app;

import android.app.PictureInPictureParams;
import android.os.Build;
import android.util.Rational;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android system Picture-in-Picture for live viewing.
 * JS marks the session as eligible; MainActivity enters PiP on Home
 * (onUserLeaveHint) or when JS calls enter().
 */
@CapacitorPlugin(name = "LivePip")
public class PipPlugin extends Plugin {
    private boolean eligible = false;

    @PluginMethod
    public void setEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", false);
        eligible = Boolean.TRUE.equals(enabled);
        MainActivity activity = getMain();
        if (activity != null) {
            activity.setPipEligible(eligible);
        }
        JSObject ret = new JSObject();
        ret.put("enabled", eligible);
        call.resolve(ret);
    }

    @PluginMethod
    public void enter(PluginCall call) {
        MainActivity activity = getMain();
        JSObject ret = new JSObject();
        if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            ret.put("entered", false);
            call.resolve(ret);
            return;
        }
        boolean ok = activity.enterPipMode();
        ret.put("entered", ok);
        call.resolve(ret);
    }

    /** Dismiss the system PiP window (e.g. host ended, or viewer closed the live). */
    @PluginMethod
    public void dismiss(PluginCall call) {
        MainActivity activity = getMain();
        JSObject ret = new JSObject();
        boolean dismissed = activity != null && activity.dismissPip();
        ret.put("dismissed", dismissed);
        call.resolve(ret);
    }

    @PluginMethod
    public void isInPip(PluginCall call) {
        MainActivity activity = getMain();
        boolean inPip = false;
        if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            inPip = activity.isInPictureInPictureMode();
        }
        JSObject ret = new JSObject();
        ret.put("value", inPip);
        call.resolve(ret);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O;
        MainActivity activity = getMain();
        if (supported && activity != null) {
            supported = activity.getPackageManager()
                .hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE);
        }
        ret.put("value", supported);
        call.resolve(ret);
    }

    public void notifyModeChanged(boolean active) {
        JSObject data = new JSObject();
        data.put("active", active);
        notifyListeners("pipModeChange", data);
    }

    private MainActivity getMain() {
        if (getActivity() instanceof MainActivity) {
            return (MainActivity) getActivity();
        }
        return null;
    }

    /** Used by MainActivity / tests — prefer MainActivity.buildParams. */
    public static PictureInPictureParams buildParams() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null;
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder()
            .setAspectRatio(new Rational(9, 16));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            b.setAutoEnterEnabled(true);
            b.setSeamlessResizeEnabled(true);
        }
        return b.build();
    }
}
