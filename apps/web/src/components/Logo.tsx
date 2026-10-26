import logoUrl from '../assets/logo.png';

export function Logo({ size = 32 }: { size?: number }) {
  return <img src={logoUrl} width={size} height={size} alt="" draggable={false} />;
}
