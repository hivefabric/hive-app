import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="copy-block">
      {label && <div className="form-label" style={{ marginBottom: 6 }}>{label}</div>}
      <pre className="copy-block__code">{text}</pre>
      <button className="copy-block__btn btn btn--ghost btn--sm" onClick={copy}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
