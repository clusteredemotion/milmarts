import { useEffect, useState } from 'react';
import {
  Gift,
  Heart,
  Package,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';

const PRELOADER_DURATION = 4000;

export function MilmartsPreloader() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setIsVisible(false);
    }, PRELOADER_DURATION);

    return () => window.clearTimeout(timeout);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="milmarts-preloader" role="status" aria-live="polite" aria-label="Loading Milmarts">
      <div className="milmarts-preloader-doodle milmarts-preloader-doodle--bag" aria-hidden="true">
        <ShoppingBag />
      </div>
      <div className="milmarts-preloader-doodle milmarts-preloader-doodle--cart" aria-hidden="true">
        <ShoppingCart />
      </div>
      <div className="milmarts-preloader-doodle milmarts-preloader-doodle--gift" aria-hidden="true">
        <Gift />
      </div>
      <div className="milmarts-preloader-doodle milmarts-preloader-doodle--heart" aria-hidden="true">
        <Heart />
      </div>
      <div className="milmarts-preloader-doodle milmarts-preloader-doodle--package" aria-hidden="true">
        <Package />
      </div>
      <div className="milmarts-preloader-doodle milmarts-preloader-doodle--sparkle" aria-hidden="true">
        <Sparkles />
      </div>

      <div className="milmarts-preloader-content">
        <div className="milmarts-preloader-logo-wrap">
          <img src="/milmarts-wordmark.png" alt="Milmarts" className="milmarts-preloader-logo" />
        </div>
        <p className="milmarts-preloader-kicker">The good stuff, gathered.</p>
        <div className="milmarts-preloader-loader" aria-hidden="true">
          <span />
        </div>
        <p className="milmarts-preloader-caption">Shopping made easy</p>
      </div>
    </div>
  );
}