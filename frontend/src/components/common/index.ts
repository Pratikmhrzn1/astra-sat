/**
 * The design-system primitives and class recipes, re-exported so a component
 * imports one module ('@/components/common') instead of one per element.
 * Anything here is presentational and knows nothing about features, routing
 * or data fetching.
 */
export { Button, buttonClass, type ButtonVariant, type ButtonSize } from './Button';
export { Card, CardHeader, CardBody, CardTitle, surfaceClass, cardClass, kickerClass, pageClass } from './Card';
export { Badge, SubjectBadge, RoleBadge } from './Badge';
export { PageHeader, pillClass, chipClass } from './PageHeader';
export { EmptyState, NoteCard, ErrorBanner } from './States';
export { Input, Textarea, Select } from './Input';
export {
  fieldClass, inputClass, labelClass, errorTextClass, hintTextClass, alertClass,
  segmentGroupClass, segmentClass,
} from './formStyles';
export { Modal, ConfirmModal } from './Modal';
export { Sheet } from './Sheet';
export { Toggle } from './Toggle';
export { Spinner, PageLoader } from './Spinner';
export { TrendChart, TREND_COLORS, type TrendSeries } from './TrendChart';
export { AccuracyBars, type AccuracyRow } from './AccuracyBars';
export { SkillSelect } from './SkillSelect';
