import type {Translator} from '../services/i18n';

interface Props {
    t: Translator;
    updatedAt?: number;
}

export default function RefreshControls({t, updatedAt}: Props) {
    if (!updatedAt) return null;

    return (
        <div className="refresh-controls">
            <span>{t('dashboard.lastUpdated')}: {new Date(updatedAt).toLocaleTimeString()}</span>
        </div>
    );
}
