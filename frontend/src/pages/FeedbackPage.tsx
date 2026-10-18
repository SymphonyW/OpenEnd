import type {Translator} from '../services/i18n';
import type {PageDefinition} from '../types/navigation';

interface FeedbackPageProps {
    page: PageDefinition;
    t: Translator;
}

function FeedbackPage({page, t}: FeedbackPageProps) {
    const email = t('feedback.email');
    const mailtoHref = `mailto:${email}?subject=${encodeURIComponent(t('feedback.mailSubject'))}&body=${encodeURIComponent(t('feedback.mailBody'))}`;

    return (
        <section className="page-panel feedback-page" aria-label={page.title}>
            <div className="feedback-content">
                <div className="feedback-primary">
                    <p>{page.description}</p>
                    <a className="primary-action-button feedback-mail-button" href={mailtoHref}>
                        {t('feedback.mailAction')}
                    </a>
                </div>

                <dl className="feedback-details">
                    <div>
                        <dt>{t('field.message')}</dt>
                        <dd>{t('feedback.requestHint')}</dd>
                    </div>
                    <div>
                        <dt>{t('field.email')}</dt>
                        <dd>
                            <a href={`mailto:${email}`}>{email}</a>
                        </dd>
                    </div>
                    <div>
                        <dt>{t('field.reason')}</dt>
                        <dd>{t('feedback.bodyHint')}</dd>
                    </div>
                    <div className="feedback-template-row">
                        <dt>{t('feedback.templateTitle')}</dt>
                        <dd>
                            <pre className="feedback-template">{t('feedback.mailBody')}</pre>
                        </dd>
                    </div>
                </dl>
            </div>
        </section>
    );
}

export default FeedbackPage;
