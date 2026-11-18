import React, { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useGlobalSearchParams, usePathname, useSegments } from 'expo-router';
import { useApp } from '../context/AppContext';
import { useI18n } from '../hooks/useI18n';
import { C } from '../theme/colors';
import { isAuthPath, loginHref, pathOnly, postLoginTarget } from '../services/authRedirect';

function Wait({ message }: { message: string }) {
  return <View accessibilityRole="progressbar" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: C.paper }}><ActivityIndicator color={C.primary} /><Text style={{ color: C.muted }}>{message}</Text></View>;
}

function currentTarget(pathname: string, segments: string[], params: Record<string, string | string[] | undefined>): string {
  const dynamic = new Set(segments.filter(s => /^\[.+\]$/.test(s)).map(s => s.slice(1, -1).replace('...', '')));
  const query = Object.entries(params)
    .filter(([key, value]) => !dynamic.has(key) && value !== undefined)
    .flatMap(([key, value]) => (Array.isArray(value) ? value : [value as string]).map(v => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`))
    .join('&');
  return query ? `${pathname}?${query}` : pathname;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const { token, authLoading, isAdmin, sessionUnverified, sessionNotice, retrySession, signedOutByUser } = useApp();
  const { t } = useI18n();
  const pathname = usePathname();
  const segments = useSegments();
  const params = useGlobalSearchParams<Record<string, string | string[]>>();
  const [settled, setSettled] = useState(false);
  if (!authLoading && !settled) setSettled(true);
  const loading = authLoading && !settled;
  const onAuthPage = isAuthPath(pathname);
  const target = currentTarget(pathname, segments, params);
  const destination = loading ? null
    : !token ? (onAuthPage || sessionUnverified ? null : signedOutByUser ? '/login' : loginHref(target))
      : onAuthPage ? postLoginTarget(params.redirect, isAdmin)
        : pathOnly(pathname).startsWith('/admin') && !isAdmin ? '/' : null;
  useEffect(() => { if (destination) router.replace(destination as never); }, [destination]);
  if (loading) return <Wait message={t('Đang kiểm tra phiên đăng nhập…')} />;
  if (!token && sessionUnverified && !onAuthPage) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: C.paper }}>
      <Text accessibilityRole="alert" style={{ textAlign: 'center', color: C.danger }}>{t(sessionNotice)}</Text>
      <Pressable accessibilityRole="button" onPress={retrySession}><Text style={{ fontWeight: '700', color: C.primaryDark }}>{t('Thử lại')}</Text></Pressable>
    </View>;
  }
  if (destination) return <Wait message={t('Đang chuyển hướng…')} />;
  return <>{children}</>;
}
