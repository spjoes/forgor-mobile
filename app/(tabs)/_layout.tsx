import { Redirect } from 'expo-router';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';

export default function TabLayout() {
  const { isUnlocked } = useApp();

  if (!isUnlocked) {
    return <Redirect href="/unlock" />;
  }

  return (
    <NativeTabs
      blurEffect="systemChromeMaterialDark"
      backgroundColor="rgba(49, 50, 68, 0.65)"
      shadowColor="rgba(0, 0, 0, 0.35)"
      tintColor="#89b4fa"
      iconColor="#7f849c"
      labelStyle={{ color: '#7f849c' }}
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <Icon src={<VectorIcon family={Ionicons} name="lock-closed" />} />
        <Label>Vault</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="nearby">
        <Icon src={<VectorIcon family={Ionicons} name="wifi" />} />
        <Label>Nearby</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="friends">
        <Icon src={<VectorIcon family={Ionicons} name="people" />} />
        <Label>Friends</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
