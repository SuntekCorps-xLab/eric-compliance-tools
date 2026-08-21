import ericMark from '../assets/eric-mark.svg';

interface BrandProps {
  footer?: boolean;
}

export function Brand({ footer = false }: BrandProps) {
  return (
    <a className={`brand${footer ? ' footer-brand' : ''}`} href="/#main" aria-label="ERiC home">
      <img className="brand-mark" src={ericMark} alt="" />
      <span className="brand-wordmark">
        ERiC <small>GLOBAL COMPLIANCE</small>
      </span>
    </a>
  );
}
