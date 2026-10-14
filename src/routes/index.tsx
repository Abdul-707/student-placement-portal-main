import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { resolvePortalAccess, rolePath } from '@/lib/portal-access';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Student Placement Portal' },
      { name: 'description', content: 'Your workspace for campus placements, jobs, applications, and insights.' },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const authType = params.get('type') || hash.get('type');

    if (authType === 'recovery') {
      window.location.replace('/reset-password' + window.location.search + window.location.hash);
      return;
    }

    void (async () => {
      try {
        const access = await resolvePortalAccess();
        if (access.role) {
          navigate({ to: rolePath(access.role) as any, replace: true });
          return;
        }
        navigate({ to: '/auth', replace: true });
      } catch {
        navigate({ to: '/auth', replace: true });
      }
    })();
  }, [navigate]);

  return null;
}
