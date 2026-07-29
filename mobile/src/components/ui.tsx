import React from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import styled from 'styled-components/native';
import { colors, radius, shadows, spacing } from '../theme';

export const Screen = styled.SafeAreaView`
  flex: 1;
  background-color: ${colors.background};
`;

export const ScrollContent = styled.ScrollView.attrs({
  contentContainerStyle: {
    padding: spacing.md,
    paddingBottom: 28,
  },
  showsVerticalScrollIndicator: false,
})`
  flex: 1;
`;

export const Card = styled.View`
  background-color: ${colors.surface};
  border-width: 1px;
  border-color: ${colors.border};
  border-radius: ${radius.lg}px;
  padding: ${spacing.md}px;
  shadow-color: #000;
  shadow-opacity: 0.28;
  shadow-radius: 18px;
  shadow-offset: 0px 10px;
  elevation: 8;
`;

export const HeroCard = styled(Card)`
  padding: ${spacing.lg}px;
  overflow: hidden;
`;

export const Row = styled.View`
  flex-direction: row;
  align-items: center;
`;

export const SpaceBetween = styled(Row)`
  justify-content: space-between;
`;

export const Title = styled.Text`
  color: ${colors.text};
  font-size: 26px;
  font-weight: 800;
`;

export const SectionTitle = styled.Text`
  color: ${colors.text};
  font-size: 18px;
  font-weight: 700;
`;

export const Body = styled.Text`
  color: ${colors.textMuted};
  font-size: 13px;
  line-height: 18px;
`;

export const MetricValue = styled.Text`
  color: ${colors.text};
  font-size: 22px;
  font-weight: 800;
`;

export const MetricLabel = styled.Text`
  color: ${colors.textMuted};
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
`;

export const Pill = styled.View<{ tone?: 'accent' | 'success' | 'warning' | 'danger' }>`
  padding-horizontal: 10px;
  padding-vertical: 6px;
  border-radius: 999px;
  background-color: ${({ tone }) => {
    switch (tone) {
      case 'success':
        return 'rgba(34,197,94,0.15)';
      case 'warning':
        return 'rgba(245,158,11,0.16)';
      case 'danger':
        return 'rgba(239,68,68,0.16)';
      default:
        return colors.chip;
    }
  }};
`;

export const PillText = styled.Text<{ tone?: 'accent' | 'success' | 'warning' | 'danger' }>`
  color: ${({ tone }) => {
    switch (tone) {
      case 'success':
        return '#86efac';
      case 'warning':
        return '#fcd34d';
      case 'danger':
        return '#fca5a5';
      default:
        return '#93c5fd';
    }
  }};
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.7px;
`;

export const Input = styled(TextInput)`
  background-color: ${colors.surfaceElevated};
  border-width: 1px;
  border-color: ${colors.borderStrong};
  border-radius: ${radius.md}px;
  color: ${colors.text};
  padding-horizontal: 14px;
  padding-vertical: 12px;
  font-size: 15px;
`;

export const TextArea = styled(Input).attrs({
  multiline: true,
  textAlignVertical: 'top',
})`
  min-height: 110px;
`;

const ButtonShell = styled(Pressable)<{ variant?: 'primary' | 'secondary' | 'ghost' }>`
  min-height: 46px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  padding-horizontal: 16px;
  background-color: ${({ variant }) =>
    variant === 'secondary' ? colors.surfaceElevated : variant === 'ghost' ? 'transparent' : colors.accent};
  border-width: ${({ variant }) => (variant === 'ghost' ? 0 : 1)}px;
  border-color: ${colors.borderStrong};
`;

const ButtonText = styled.Text<{ variant?: 'primary' | 'secondary' | 'ghost' }>`
  color: ${({ variant }) => (variant === 'secondary' ? colors.text : variant === 'ghost' ? colors.textMuted : '#ffffff')};
  font-size: 14px;
  font-weight: 700;
`;

export const Button: React.FC<React.ComponentProps<typeof ButtonShell> & { label: string; loading?: boolean }> = ({ label, loading, children, ...props }) => (
  <ButtonShell {...props}>
    {loading ? <ActivityIndicator color="#fff" /> : null}
    {!loading ? <ButtonText variant={props.variant}>{label}</ButtonText> : null}
    {children}
  </ButtonShell>
);

export const Divider = styled.View`
  height: 1px;
  background-color: ${colors.border};
  margin-vertical: ${spacing.md}px;
`;

export const ChipRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;

export const EmptyBox = styled.View`
  padding: ${spacing.lg}px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.lg}px;
  background-color: ${colors.surface};
  border-width: 1px;
  border-color: ${colors.border};
`;

export const Tiny = styled.Text`
  color: ${colors.textMuted};
  font-size: 11px;
`;

export const PressCard = ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
    {children}
  </Pressable>
);

export const ShadowSpacer = styled.View`
  height: 1px;
`;
