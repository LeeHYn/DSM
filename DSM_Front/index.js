import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';

import App from './src/App';
import { installNotificationHandlers } from './src/features/notifications/notification-runtime-native';

installNotificationHandlers();

AppRegistry.registerComponent('main', () => App);
