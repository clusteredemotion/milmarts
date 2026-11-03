import { Bot, ChevronRight, LoaderCircle, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { Link } from 'wouter';
import { useState } from 'react';
import type { Product } from '@workspace/api-client-react';
import { ShopifyPrice } from '@/components/shopify-price';

type AssistantMessage = {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  products?: Product[];
};

const QUICK_PROMPTS = [
  'Find something for my home',
  'Show me phone accessories',
  'Recommend a useful gift',
];

const INTENT_TERMS: Record<string, string[]> = {
  home: ['home', 'office', 'kitchen', 'clean', 'mop', 'fan', 'humidifier', 'tableware', 'storage'],
  phone: ['phone', 'tablet', 'charger', 'charging', 'gimbal', 'smartphone', 'mobile', 'tech'],
  fashion: ['fashion', 'bag', 'backpack', 'shoe', 'sneaker', 'slipper', 'clothes', 'wear'],
  beauty: ['beauty', 'nail', 'hair', 'skin', 'health', 'self-care', 'eyelash'],
  gift: ['gift', 'present', 'surprise', 'useful', 'recommend', 'recommendation'],
  electronics: ['electronic', 'usb', 'rechargeable', 'gadget', 'device', 'fan'],
};

function tokenize(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
}

function recommendProducts(query: string, catalog: Product[]) {
  const words = tokenize(query);
  const intentWords = Object.values(INTENT_TERMS).flat();
  const expandedWords = new Set(words);

  Object.entries(INTENT_TERMS).forEach(([intent, terms]) => {
    if (terms.some((term) => words.includes(term))) {
      terms.forEach((term) => expandedWords.add(term));
      expandedWords.add(intent);
    }
  });

  const scored = catalog.map((product, index) => {
    const searchableText = `${product.title} ${product.description}`.toLowerCase();
    const productWords = new Set(tokenize(searchableText));
    let score = Math.max(0, 10 - index * 0.08);

    expandedWords.forEach((word) => {
      if (productWords.has(word)) score += 5;
      else if (searchableText.includes(word)) score += 2;
    });

    if (words.some((word) => intentWords.includes(word)) && product.variants.some((variant) => variant.availableForSale)) score += 1;
    return { product, score };
  });

  const hasSpecificMatch = scored.some(({ score }) => score > 11);
  return scored
    .filter(({ score }) => !hasSpecificMatch || score > 11)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ product }) => product);
}

function assistantReply(query: string, catalog: Product[]) {
  const products = recommendProducts(query, catalog);
  if (!products.length) {
    return {
      text: 'I could not find a close match yet. Try asking for home, phone accessories, fashion, beauty, or gifts.',
      products: [],
    };
  }

  const queryWords = tokenize(query);
  const matchedIntent = Object.entries(INTENT_TERMS).find(([, terms]) => terms.some((term) => queryWords.includes(term)))?.[0];
  const focus = matchedIntent === 'gift' ? 'useful gift ideas' : matchedIntent ? `${matchedIntent} picks` : 'these live catalog picks';
  return {
    text: `Here are a few ${focus} from the Milmarts shelf. Tap a product to see the details.`,
    products,
  };
}

export function MillmartAiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 1,
      role: 'assistant',
      text: 'Hi, I’m Millmart AI. Tell me what you are shopping for and I’ll find useful picks from the live catalog.',
    },
  ]);

  const loadCatalog = async () => {
    if (catalogLoaded) return catalog;
    setIsLoadingCatalog(true);
    try {
      const response = await fetch('/api/storefront/products?first=24');
      if (!response.ok) throw new Error('Catalog request failed');
      const data = (await response.json()) as { products?: Product[] };
      const products = data.products ?? [];
      setCatalog(products);
      setCatalogLoaded(true);
      return products;
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  const sendMessage = async (value: string) => {
    const query = value.trim();
    if (!query || isThinking) return;

    setInput('');
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text: query }]);
    setIsThinking(true);
    try {
      const liveCatalog = await loadCatalog();
      const reply = assistantReply(query, liveCatalog);
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: reply.text, products: reply.products }]);
    } catch {
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: 'The live shelf is taking a moment. Please try again shortly.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleOpen = () => {
    setIsOpen((current) => !current);
    if (!catalogLoaded && !isLoadingCatalog) void loadCatalog().catch(() => undefined);
  };

  return (
    <>
      {isOpen && (
        <section id="millmart-ai-panel" className="millmart-ai-panel" aria-label="Millmart AI shopping assistant">
          <div className="millmart-ai-panel-header">
            <div className="millmart-ai-panel-title">
              <span className="millmart-ai-avatar"><Sparkles className="h-4 w-4" /></span>
              <div><strong>Millmart AI</strong><span>Free local shopping help</span></div>
            </div>
            <button type="button" className="millmart-ai-close" onClick={() => setIsOpen(false)} aria-label="Close Millmart AI"><X className="h-4 w-4" /></button>
          </div>

          <div className="millmart-ai-messages" aria-live="polite">
            {messages.map((message) => (
              <div className={`millmart-ai-message millmart-ai-message--${message.role}`} key={message.id}>
                <div className="millmart-ai-bubble">{message.text}</div>
                {message.products && message.products.length > 0 && (
                  <div className="millmart-ai-results">
                    {message.products.map((product) => {
                      const image = product.featuredImage?.url ?? product.images[0]?.url;
                      return (
                        <Link href={`/product/${product.handle}`} className="millmart-ai-product" key={product.id} onClick={() => setIsOpen(false)}>
                          {image ? <img src={image} alt="" /> : <span className="millmart-ai-product-placeholder"><Bot className="h-4 w-4" /></span>}
                          <span><strong>{product.title}</strong><ShopifyPrice minAmount={product.priceRange.minVariantPrice} maxAmount={product.priceRange.maxVariantPrice} /></span>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {isThinking && <div className="millmart-ai-message millmart-ai-message--assistant"><div className="millmart-ai-bubble millmart-ai-thinking"><LoaderCircle className="h-4 w-4 animate-spin" /> Checking the live shelf…</div></div>}
          </div>

          {messages.length === 1 && (
            <div className="millmart-ai-prompts">
              {QUICK_PROMPTS.map((prompt) => <button type="button" key={prompt} onClick={() => void sendMessage(prompt)}>{prompt}</button>)}
            </div>
          )}

          <form className="millmart-ai-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(input); }}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about products…" aria-label="Ask Millmart AI" />
            <button type="submit" disabled={!input.trim() || isThinking} aria-label="Send message"><Send className="h-4 w-4" /></button>
          </form>
          <p className="millmart-ai-note">Uses live Milmarts products. No external AI service.</p>
        </section>
      )}

      <button type="button" className={`millmart-ai-launcher ${isOpen ? 'is-open' : ''}`} onClick={handleOpen} aria-expanded={isOpen} aria-controls="millmart-ai-panel">
        <span className="millmart-ai-launcher-icon">{isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}</span>
        <span>Millmart AI</span>
      </button>
    </>
  );
}