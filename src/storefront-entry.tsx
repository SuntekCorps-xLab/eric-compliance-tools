import { createRoot } from 'react-dom/client';
import { StorefrontApp } from './storefront/StorefrontApp';
import { readShopifyStorefrontContext } from './storefront/context';
import './styles.css';

const roots = [...document.querySelectorAll<HTMLElement>('[data-eric-root]')];
// Validate every root before mounting: service lookups must skip invalid siblings.
const configured = roots.flatMap((root) => {
  try {
    return [{ root, context: readShopifyStorefrontContext(root) }];
  } catch {
    root.dataset.ericInvalid = 'true';
    const notice = document.createElement('p');
    notice.className = 'storefront-session-notice error';
    notice.setAttribute('role', 'alert');
    notice.textContent =
      'ERiC configuration unavailable. Configure all required public HTTPS API endpoints in the theme editor, then reload.';
    root.replaceChildren(notice);
    return [];
  }
});

configured.forEach(({ root, context }) => {
  // A page with multiple embeds keeps the theme visible so every notice remains reachable.
  if (context.hideThemeChrome && roots.length === 1) {
    let shell = root;
    while (shell.parentElement && shell.parentElement !== document.body) {
      const parent = shell.parentElement;
      if (context.surface === 'workspace') {
        parent.classList.add('eric-workspace-layout-host');
        [...parent.children].forEach((child) => {
          if (child !== shell && !/^(SCRIPT|STYLE|LINK)$/.test(child.tagName))
            child.classList.add('eric-workspace-theme-chrome');
        });
      }
      shell = parent;
    }
    shell.classList.add(`eric-${context.surface}-shell`);
    document.documentElement.classList.add(`eric-${context.surface}-active`);
  }
  createRoot(root).render(<StorefrontApp context={context} />);
});
