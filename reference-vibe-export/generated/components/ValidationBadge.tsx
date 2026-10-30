import { Badge } from '@/components/ui/badge';

interface ValidationBadgeProps {
  validationTechnique: boolean | null;
  validationPolitique: boolean | null;
  validParDateClef?: boolean | null;
  size?: 'sm' | 'md' | 'lg';
}

export function ValidationBadge({ validationTechnique, validationPolitique, validParDateClef, size = 'md' }: ValidationBadgeProps) {
  const isFullyValidated = validationTechnique === true && validationPolitique === true;
  
  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  return (
    <div className="flex items-center gap-2">
      {isFullyValidated ? (
        <Badge 
          variant="default" 
          className={`${sizeClasses[size]} bg-green-600 hover:bg-green-700 text-white border-0`}
        >
          ✓ Validée
        </Badge>
      ) : (
        <Badge 
          variant="outline" 
          className={`${sizeClasses[size]} bg-red-50 text-red-700 border-red-300`}
        >
          ✗ Non validée
        </Badge>
      )}

      {/* Badge Date Clef si validé via pastille bleue */}
      {isFullyValidated && validParDateClef === true && (
        <Badge 
          variant="default" 
          className={`${sizeClasses[size]} bg-blue-600 hover:bg-blue-700 text-white border-0`}
        >
          ✓ Date Clef
        </Badge>
      )}
    </div>
  );
}
