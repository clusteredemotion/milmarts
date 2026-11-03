import { ArrowRight, BadgeCheck, Compass, Sparkles, Zap } from 'lucide-react';
import './_group.css';

export function Redesign() {
  return (
    <section className="why-preview">
      <div className="why-preview__topline">
        <span className="why-preview__eyebrow">Why Milmarts</span>
        <span className="why-preview__context"><span className="why-preview__dot" />Thoughtful picks for everyday living</span>
      </div>
      <div className="why-preview__intro">
        <div><h1>Everything you need,<br /><em>nothing you don’t.</em></h1></div>
        <div className="why-preview__copy"><p>Shopping should feel like finding exactly what you were looking for — plus one lovely surprise.</p><span className="why-preview__link">Shop the edit <ArrowRight size={16} /></span></div>
      </div>
      <div className="why-preview__cards">
        <article className="why-preview__card"><div className="why-preview__card-top"><span>01</span><Compass size={20} /></div><h2>Useful first</h2><p>Every pick has a job to do, and a reason to earn its place in your home.</p><div className="why-preview__card-footer"><span>Made to earn its place</span><BadgeCheck size={16} /></div></article>
        <article className="why-preview__card why-preview__card--accent"><div className="why-preview__card-top"><span>02</span><Sparkles size={20} /></div><h2>Small discoveries</h2><p>Familiar categories, fresh perspective. The joy is finding the one you didn’t know to look for.</p><div className="why-preview__card-footer"><span>A little unexpected</span><Sparkles size={16} /></div></article>
        <article className="why-preview__card"><div className="why-preview__card-top"><span>03</span><Zap size={20} /></div><h2>Easy does it</h2><p>A clear shopping experience, simple cart, and secure Shopify-hosted checkout.</p><div className="why-preview__card-footer"><span>Simple from start to finish</span><Zap size={16} /></div></article>
      </div>
    </section>
  );
}