import { IconCheck, IconX } from "../Icons";
import { useTranslation } from "../i18n";
import type { WorkflowTemplateId } from "../workflowTemplates";

export type OnboardingModalProps = {
  open: boolean;
  onApplyTemplate: (templateId: WorkflowTemplateId, name: string) => void;
  onSkip: () => void;
};

export function OnboardingModal({ open, onApplyTemplate, onSkip }: OnboardingModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  const templates: Array<{
    id: WorkflowTemplateId;
    name: string;
    description: string;
  }> = [
    {
      id: "compare-three",
      name: t("onboarding.compareThree"),
      description: t("onboarding.compareThreeDescription"),
    },
    {
      id: "coding-review",
      name: t("onboarding.codingReview"),
      description: t("onboarding.codingReviewDescription"),
    },
    {
      id: "research",
      name: t("onboarding.research"),
      description: t("onboarding.researchDescription"),
    },
  ];

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section className="modal-card onboarding-card" aria-labelledby="onboarding-title">
        <header className="settings-header">
          <div>
            <p className="onboarding-step">{t("onboarding.firstRun")}</p>
            <h3 className="modal-title onboarding-title" id="onboarding-title">
              {t("onboarding.title")}
            </h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onSkip}
            aria-label={t("onboarding.dismiss")}
            title={t("onboarding.dismiss")}
          >
            <IconX size={14} />
          </button>
        </header>

        <ol className="onboarding-checklist">
          <li><IconCheck size={13} /> {t("onboarding.checkChoose")}</li>
          <li><IconCheck size={13} /> {t("onboarding.checkSignIn")}</li>
          <li><IconCheck size={13} /> {t("onboarding.checkRun")}</li>
        </ol>

        <div className="onboarding-templates">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="onboarding-template"
              onClick={() => onApplyTemplate(template.id, template.name)}
            >
              <span className="onboarding-template-name">{template.name}</span>
              <span className="onboarding-template-description">{template.description}</span>
            </button>
          ))}
        </div>

        <footer className="onboarding-actions">
          <button type="button" className="modal-btn" onClick={onSkip}>
            {t("onboarding.skip")}
          </button>
        </footer>
      </section>
    </div>
  );
}
