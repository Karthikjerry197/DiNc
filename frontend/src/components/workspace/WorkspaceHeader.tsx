'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

export interface WorkspaceBreadcrumb {
  label: string;
  href?: string;
}

export interface WorkspaceHeaderProps {
  /** The page title; rendered as the page `<h1>`. */
  title: ReactNode;
  /** Optional breadcrumb trail rendered above/left of the title. */
  breadcrumb?: WorkspaceBreadcrumb[];
  /** Search slot. M27 passes the EXISTING (disabled) search unchanged. */
  search?: ReactNode;
  /** Right-cluster actions (buttons). Account/bell stay in the shell TopBar. */
  actions?: ReactNode;
  /** Optional page-level Tabs rendered on a second row. */
  tabs?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Fixed page header inside the Workspace: title/breadcrumb · optional search slot ·
 * primary actions, with an optional second row for page-level Tabs. This is the
 * *page* header within the content region — it does not duplicate the global TopBar
 * (brand, account menu, bell), which remains in the shell.
 *
 * Single-row height is `var(--shell-header-h)`; with `tabs` it grows to auto. Never
 * scrolls; `flex-shrink:0`.
 *
 * Dormant infrastructure: no page consumes this yet.
 */
export default function WorkspaceHeader({
  title,
  breadcrumb,
  search,
  actions,
  tabs,
  className,
  style,
}: WorkspaceHeaderProps) {
  const cls = ['wsh', tabs ? 'wsh--tabbed' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={cls} style={style}>
      <div className="wsh-bar">
        <div className="wsh-lead">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="wsh-breadcrumb" aria-label="Breadcrumb">
              <ol className="wsh-breadcrumb-list">
                {breadcrumb.map((crumb, i) => (
                  <li className="wsh-breadcrumb-item" key={`${crumb.label}-${i}`}>
                    {crumb.href ? (
                      <Link className="wsh-breadcrumb-link" href={crumb.href}>
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="wsh-breadcrumb-current" aria-current="page">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <h1 className="wsh-title">{title}</h1>
        </div>

        {search && <div className="wsh-search">{search}</div>}

        {actions && <div className="wsh-actions">{actions}</div>}
      </div>

      {tabs && <div className="wsh-tabs">{tabs}</div>}
    </header>
  );
}
