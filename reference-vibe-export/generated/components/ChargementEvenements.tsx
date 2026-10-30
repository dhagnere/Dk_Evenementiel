interface ChargementEvenementsProps {
  message?: string;
  charges?: number;
  total?: number;
  compact?: boolean;
}

export default function ChargementEvenements({
  message = "Chargement des événements…",
  charges,
  total,
  compact = false,
}: ChargementEvenementsProps) {
  const spinnerSize = compact ? 32 : 40;
  const minHeight = compact ? 120 : 320;

  return (
    <>
      <style>{`
        @keyframes spin-chargement {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
      
      <div
        className={`flex flex-col items-center justify-center ${compact ? 'bg-transparent' : ''}`}
        style={{ minHeight: `${minHeight}px` }}
      >
        {/* Spinner */}
        <div
          className="relative mb-4"
          style={{ width: `${spinnerSize}px`, height: `${spinnerSize}px` }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: '4px solid #E6E9EF',
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: '4px solid #0073EA',
              borderTopColor: 'transparent',
              animation: 'spin-chargement 0.8s linear infinite',
            }}
          />
        </div>

        {/* Message principal */}
        <p
          className="text-center font-medium"
          style={{
            color: '#676879',
            fontSize: '14px',
            lineHeight: '20px',
          }}
        >
          {message}
        </p>

        {/* Progression optionnelle */}
        {charges !== undefined && total !== undefined && (
          <p
            className="mt-1 text-center"
            style={{
              color: '#9699A6',
              fontSize: '12px',
              lineHeight: '16px',
            }}
          >
            {charges} / {total} événements
          </p>
        )}
      </div>
    </>
  );
}
