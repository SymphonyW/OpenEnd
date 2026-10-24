import {useState} from 'react';
import type {OwnershipKind} from '../services/projects';

export default function OwnershipIcon({kind, iconDataURL, name}: {kind: OwnershipKind; iconDataURL: string; name: string}) {
    const [failedURL, setFailedURL] = useState('');
    const showImage = kind === 'application' && iconDataURL.trim() !== '' && iconDataURL !== failedURL;
    return <span className={`ownership-icon ${kind}`} role="img" aria-label={`${name} icon`}>
        {showImage ? <img src={iconDataURL} alt="" aria-hidden="true" onError={() => setFailedURL(iconDataURL)}/> :
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {kind === 'project' ? <><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill="#f8e0a0" stroke="#b58b32"/><path d="M3 9h18" stroke="#b58b32"/></> :
                    <><rect x="3" y="4" width="18" height="16" rx="2" fill="#eaf3fa" stroke="#6a94b6"/><path d="M3 8h18M7 6h1m2 0h1" stroke="#6a94b6"/>{kind === 'unknown' && <path d="M10 12a2 2 0 0 1 4 0c0 1-2 1-2 3m0 2v.2" stroke="#6a94b6" strokeLinecap="round"/>}</>}
            </svg>}
    </span>;
}
