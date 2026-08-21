import { createRoot } from 'react-dom/client';
import { StorefrontApp } from './storefront/StorefrontApp';
import { readShopifyStorefrontContext } from './storefront/context';
import './styles.css';

document.querySelectorAll<HTMLElement>('[data-eric-root]').forEach((root) => {
  const context = readShopifyStorefrontContext(root);
  if (context.hideThemeChrome) {
    let shell = root;
    while (shell.parentElement && shell.parentElement !== document.body) {
      shell = shell.parentElement;
      if (context.surface === 'workspace') shell.classList.add('eric-workspace-layout-host');
    }
    const shellClass =
      context.surface === 'workspace' ? 'eric-workspace-shell' : 'eric-homepage-shell';
    const activeClass =
      context.surface === 'workspace' ? 'eric-workspace-active' : 'eric-homepage-active';
    shell.classList.add(shellClass);
    document.documentElement.classList.add(activeClass);
  }
  createRoot(root).render(<StorefrontApp context={context} />);
});
