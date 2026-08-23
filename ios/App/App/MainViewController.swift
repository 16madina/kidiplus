import UIKit
import WebKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    private static let cameraKitAvailabilityJS = """
    (function () {
      function header() {
        return {
          name: 'KidiCameraKit',
          methods: [
            { name: 'initialize', rtype: 'promise' },
            { name: 'loadLenses', rtype: 'promise' },
            { name: 'applyLens', rtype: 'promise' },
            { name: 'clearLens', rtype: 'promise' },
            { name: 'startPreview', rtype: 'promise' },
            { name: 'stopPreview', rtype: 'promise' },
            { name: 'setPublishEnabled', rtype: 'promise' },
            { name: 'getStatus', rtype: 'promise' }
          ]
        };
      }
      function ensureHeader(C) {
        C.PluginHeaders = C.PluginHeaders || [];
        for (var i = 0; i < C.PluginHeaders.length; i++) {
          if (C.PluginHeaders[i] && C.PluginHeaders[i].name === 'KidiCameraKit') return;
        }
        C.PluginHeaders.push(header());
      }
      function patch(C, source) {
        if (!C || typeof C !== 'object') return false;
        ensureHeader(C);
        if (typeof C.isPluginAvailable === 'function' && C.__kidiCKWrappedFn !== C.isPluginAvailable) {
          var orig = C.isPluginAvailable.bind(C);
          C.isPluginAvailable = function (name) {
            if (name === 'KidiCameraKit') return true;
            return orig(name);
          };
          C.__kidiCKWrappedFn = C.isPluginAvailable;
          console.info('[KidiCameraKit] patched isPluginAvailable via ' + source);
        }
        return typeof C.isPluginAvailable === 'function' && C.isPluginAvailable('KidiCameraKit');
      }
      if (!window.__kidiCKAvailInstall) {
        window.__kidiCKAvailInstall = true;
        var current = window.Capacitor;
        try {
          Object.defineProperty(window, 'Capacitor', {
            configurable: true,
            enumerable: true,
            get: function () { return current; },
            set: function (v) {
              current = v;
              patch(v, 'Capacitor setter');
            }
          });
        } catch (e) {
          console.warn('[KidiCameraKit] Capacitor interceptor failed', e);
        }
        var n = 0;
        var id = setInterval(function () {
          n += 1;
          patch(window.Capacitor, 'interval');
          if (n > 400) clearInterval(id);
        }, 25);
      }
      patch(window.Capacitor, 'install');
      function warmup(reason) {
        var C = window.Capacitor;
        var p = C && C.Plugins && C.Plugins.KidiCameraKit;
        console.info('[native-camera-kit] warmup', {
          reason: reason,
          hasPlugin: !!p,
          available: !!(C && C.isPluginAvailable && C.isPluginAvailable('KidiCameraKit'))
        });
        if (!p || typeof p.initialize !== 'function') {
          console.warn('[native-camera-kit] warmup skipped — web fallback');
          return;
        }
        if (window.__kidiCKWarming) return;
        window.__kidiCKWarming = true;
        p.initialize({}).then(function () {
          console.info('[native-camera-kit] warmup ok');
        }).catch(function (e) {
          window.__kidiCKWarming = false;
          console.warn('[native-camera-kit] warmup failed — web fallback', e && (e.message || e));
        });
      }
      function wrapRegisterPlugin() {
        var C = window.Capacitor;
        if (!C || typeof C.registerPlugin !== 'function' || C.__kidiRegWrapped) return !!C && !!C.__kidiRegWrapped;
        var orig = C.registerPlugin.bind(C);
        C.registerPlugin = function (name, impl) {
          if (name === 'KidiCameraKit') {
            var existing = C.Plugins && C.Plugins.KidiCameraKit;
            if (existing && typeof existing.initialize === 'function') {
              console.info('[native-camera-kit] using window.Capacitor.Plugins.KidiCameraKit');
              return existing;
            }
          }
          return orig(name, impl);
        };
        C.__kidiRegWrapped = true;
        return true;
      }
      function wrapCamera() {
        var C = window.Capacitor;
        var cam = C && C.Plugins && C.Plugins.Camera;
        if (!cam || cam.__kidiWrapped || typeof cam.checkPermissions !== 'function') return false;
        var orig = cam.checkPermissions.bind(cam);
        cam.checkPermissions = function () {
          warmup('camera-checkPermissions');
          return orig.apply(this, arguments);
        };
        cam.__kidiWrapped = true;
        return true;
      }
      var w = 0;
      var wid = setInterval(function () {
        w += 1;
        if ((wrapCamera() && wrapRegisterPlugin()) || w > 200) clearInterval(wid);
      }, 50);
    })();
    """

    private static let cameraKitDiagJS = """
    (function () {
      var C = window.Capacitor;
      var plugin = C && C.Plugins && C.Plugins.KidiCameraKit;
      var headers = (C && C.PluginHeaders) ? C.PluginHeaders.map(function (h) { return h && h.name; }) : [];
      var detection = {
        platform: C && C.getPlatform && C.getPlatform(),
        native: C && C.isNativePlatform && C.isNativePlatform(),
        available: C && C.isPluginAvailable && C.isPluginAvailable('KidiCameraKit'),
        hasPlugin: !!plugin,
        initializeType: plugin ? typeof plugin.initialize : 'undefined',
        headers: headers
      };
      console.info('[native-camera-kit] detection', detection);
      if (plugin && typeof plugin.getStatus === 'function') {
        plugin.getStatus().then(function (s) {
          console.info('[native-camera-kit] getStatus', s);
        }).catch(function (e) {
          console.warn('[native-camera-kit] getStatus failed', e && (e.message || e));
        });
      }
    })();
    """

    override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.userContentController.addUserScript(
            WKUserScript(
                source: Self.cameraKitAvailabilityJS,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: false
            )
        )
        return config
    }

    override open func capacitorDidLoad() {
        guard let bridge else {
            print("[KidiCameraKit] capacitorDidLoad: bridge is nil")
            return
        }
        bridge.registerPluginInstance(LivePipPlugin())
        bridge.registerPluginInstance(KidiCameraKitPlugin())
        print("[KidiCameraKit] registered on Capacitor bridge")
        LivePipSession.shared.attach(to: view)
        installCameraKitAvailabilityPatch()
    }

    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        installCameraKitAvailabilityPatch()
    }

    private func installCameraKitAvailabilityPatch() {
        guard let webView = webView ?? bridge?.webView else { return }
        let alreadyInstalled = webView.configuration.userContentController.userScripts.contains {
            $0.source.contains("__kidiCKAvailInstall")
        }
        if !alreadyInstalled {
            let script = WKUserScript(
                source: Self.cameraKitAvailabilityJS,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: false
            )
            webView.configuration.userContentController.addUserScript(script)
        }
        webView.evaluateJavaScript(Self.cameraKitAvailabilityJS, completionHandler: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak webView] in
            webView?.evaluateJavaScript(Self.cameraKitDiagJS, completionHandler: nil)
        }
    }
}
