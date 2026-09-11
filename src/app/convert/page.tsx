import OmaUriConverter from '@/components/OmaUriConverter';

export const metadata = {
  title: 'OMA-URI Converter | Intune Settings Catalog Viewer',
  description:
    'Convert a custom OMA-URI device configuration profile (JSON) into the equivalent Intune Settings Catalog policy JSON.',
};

export const dynamic = 'force-static';

export default function ConvertPage() {
  return <OmaUriConverter />;
}
