import { View } from 'react-native';

/** Settings cog drawn from plain views, so it renders the same on iOS, Android and web with no icon font. */
export function CogIcon({ size = 22, color }: { size?: number; color: string }) {
  const ring = size * 0.64;
  const border = size * 0.17;
  const tooth = size * 0.2;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <View
          key={deg}
          style={{ position: 'absolute', width: size, height: size, alignItems: 'center', transform: [{ rotate: `${deg}deg` }] }}
        >
          <View style={{ width: tooth, height: size * 0.26, backgroundColor: color, borderRadius: tooth * 0.2 }} />
        </View>
      ))}
      <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: border, borderColor: color }} />
    </View>
  );
}
