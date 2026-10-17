import type {OperationResult} from '../types/processes';
import type {Translator} from './i18n';

export type OperationVariant = 'success' | 'error' | 'warning';
export function operationVariant(result: OperationResult): OperationVariant {
    return result.partial ? 'warning' : result.success ? 'success' : 'error';
}
export function operationText(result: OperationResult, t: Translator): string {
    if (result.code === 'identity_changed') return t('operation.identityChanged');
    if (result.code === 'permission_denied' || /permission denied|access is denied/i.test(result.message)) {
        return result.message + ' ' + t('operation.permissionHint');
    }
    return result.partial ? t('operation.partial') + ': ' + result.message : result.message;
}
