import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, children, action }: Props) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty__icon">
          <Icon size={28} strokeWidth={1.6} />
        </div>
      )}
      <h3 className="empty__title">{title}</h3>
      {children && <p className="empty__text">{children}</p>}
      {action}
    </div>
  );
}
