import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isRunningAsApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);
  const [isAppleMobile, setIsAppleMobile] = useState(false);

  useEffect(() => {
    setIsInstalled(isRunningAsApp());
    setIsAppleMobile(
      /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    );

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!showInstallInstructions) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowInstallInstructions(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showInstallInstructions]);

  if (isInstalled) return null;

  const installApp = async () => {
    if (!installPrompt) {
      setShowInstallInstructions(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setIsInstalled(true);
    setInstallPrompt(null);
  };

  return (
    <>
      <button className="market-topbar-install" type="button" onClick={() => void installApp()}>
        <Download className="h-3.5 w-3.5" />
        <span>Install app</span>
      </button>
      {showInstallInstructions && (
        <div className="pwa-install-backdrop" role="presentation" onClick={() => setShowInstallInstructions(false)}>
          <section
            className="pwa-install-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="pwa-install-close" type="button" aria-label="Close install instructions" onClick={() => setShowInstallInstructions(false)}>
              <X className="h-5 w-5" />
            </button>
            <div className="pwa-install-icon">{isAppleMobile ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}</div>
            <h2 id="pwa-install-title">{isAppleMobile ? 'Add Milmarts to your Home Screen' : 'Install the Milmarts app'}</h2>
            {isAppleMobile
              ? <p>In Safari, tap <Share className="pwa-inline-share-icon" /> <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.</p>
              : <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. If the option is missing in this preview, open the published Milmarts site and try again.</p>}
          </section>
        </div>
      )}
    </>
  );
}
