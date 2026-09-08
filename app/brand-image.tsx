// Static GitHub Pages has no Next.js image optimization server; use supplied assets directly.
/* oxlint-disable next/no-img-element */
export default function BrandImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return <img src={src} alt={alt} className={className} decoding="async" />;
}
