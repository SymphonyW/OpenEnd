import type {Translator} from '../services/i18n';

interface Props {
    t: Translator;
    paused: boolean;
    setPaused: (value: boolean) => void;
    updatedAt?: number;
}

export default function RefreshControls({t, paused, setPaused, updatedAt}: Props) {
    return (
        <div className="refresh-controls">
            <button type="button" className="sort-button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
                {t(paused ? 'refresh.resume' : 'refresh.pause')}
            </button>
            {updatedAt && <span>{t('dashboard.lastUpdated')}: {new Date(updatedAt).toLocaleTimeString()}</span>}
        </div>
    );
}
