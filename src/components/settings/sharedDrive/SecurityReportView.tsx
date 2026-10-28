import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { SecurityReport } from '../../../features/sharedDrive/security';

const ICON = {
    pass: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />,
    warn: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />,
    block: <XCircle className="h-4 w-4 shrink-0 text-rose-300" />,
};

/** 공유 드라이브 보안 점검 결과(차단·주의·통과) */
export default function SecurityReportView({ report }: { report: SecurityReport }) {
    return (
        <ul data-testid="shared-drive-security" data-blocked={report.blocked ? 'true' : 'false'} className="space-y-1.5 text-xs">
            {report.checks.map(check => (
                <li key={check.id} data-level={check.level} className="flex items-start gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                    {ICON[check.level]}
                    <span>
                        <span className="font-semibold text-white/90">{check.title}</span>
                        <span className="block text-white/55">{check.detail}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}
