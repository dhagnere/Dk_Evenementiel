/**
 * Composant affichant les logos officiels de la Ville de Dunkerque 
 * et de la Communauté Urbaine de Dunkerque
 */

type LogosInstitutionnelsProps = {
  variant?: 'horizontal' | 'stacked';
  size?: 'sm' | 'md' | 'lg';
};

export function LogosInstitutionnels({ variant = 'horizontal', size = 'md' }: LogosInstitutionnelsProps) {
  // Même taille pour les deux logos
  const heights = {
    sm: 'h-12',   // 48px
    md: 'h-16',   // 64px
    lg: 'h-24'    // 96px
  };

  const gaps = {
    sm: 'gap-4',
    md: 'gap-5',
    lg: 'gap-6'
  };

  const containerClass = variant === 'horizontal' 
    ? `flex items-center ${gaps[size]} flex-wrap`
    : `flex flex-col items-start ${gaps[size]}`;

  return (
    <div className={containerClass}>
      <img 
        src="https://files-public.monday.com/euc1/205eaf39-ad6d-43d7-a3eb-5a5ae7ce64a6/DK_logo2016.png"
        alt="Ville de Dunkerque"
        className={`${heights[size]} w-auto object-contain`}
      />
      <img 
        src="https://upload.wikimedia.org/wikipedia/fr/8/8f/Communaut%C3%A9_urbaine_de_Dunkerque_%28logo%29.svg"
        alt="Communauté Urbaine de Dunkerque"
        className={`${heights[size]} w-auto object-contain`}
      />
    </div>
  );
}
