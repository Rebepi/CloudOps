import { FivePillarsWorkspace } from './FivePillarsWorkspace';
import type { EvaluacionSeguridad } from '../../types/cloud';

export interface ProtectionWorkspaceProps {
  assessment: EvaluacionSeguridad;
  compact?: boolean;
  onFinding: (id: string) => void;
  onCoverage: () => void;
  onArea?: (id: string) => void;
  initialArea?: string;
}

export function ProtectionWorkspace({
  assessment,
  compact = false,
  onFinding,
  onCoverage,
  onArea: _onArea,
  initialArea = 'identity',
}: ProtectionWorkspaceProps) {
  return (
    <FivePillarsWorkspace
      assessment={assessment}
      initialArea={initialArea}
      onFinding={onFinding}
      onCoverage={onCoverage}
      compact={compact}
    />
  );
}
