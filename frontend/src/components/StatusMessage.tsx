import type {ReactNode} from 'react';

type StatusMessageVariant = 'loading' | 'error' | 'empty' | 'success' | 'warning';

interface StatusMessageProps {
    children: ReactNode;
    variant: StatusMessageVariant;
}

function StatusMessage({children, variant}: StatusMessageProps) {
    return (
        <p className={`status-message ${variant}`} role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}>
            {children}
        </p>
    );
}

export default StatusMessage;
