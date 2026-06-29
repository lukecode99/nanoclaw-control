import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

export default function BrowserScreen() {
  const webviewRef = useRef<WebView>(null);
  const [url, setUrl] = useState('https://google.com');
  const [inputUrl, setInputUrl] = useState('https://google.com');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [paused, setPaused] = useState(false);

  const navigate = () => {
    let target = inputUrl.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }
    setUrl(target);
    setInputUrl(target);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* URL Bar */}
      <View style={styles.urlBar}>
        <TouchableOpacity
          style={[styles.navBtn, !canGoBack && styles.navBtnDisabled]}
          onPress={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
        >
          <Ionicons name="chevron-back" size={20} color={canGoBack ? '#00d4ff' : '#333'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, !canGoForward && styles.navBtnDisabled]}
          onPress={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
        >
          <Ionicons name="chevron-forward" size={20} color={canGoForward ? '#00d4ff' : '#333'} />
        </TouchableOpacity>
        <TextInput
          style={styles.urlInput}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={navigate}
          returnKeyType="go"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          selectTextOnFocus
        />
        <TouchableOpacity style={styles.navBtn} onPress={() => webviewRef.current?.reload()}>
          <Ionicons name="refresh" size={20} color="#00d4ff" />
        </TouchableOpacity>
      </View>

      {/* WebView */}
      <View style={styles.webviewContainer}>
        {!paused ? (
          <WebView
            ref={webviewRef}
            source={{ uri: url }}
            style={styles.webview}
            onNavigationStateChange={state => {
              setCanGoBack(state.canGoBack);
              setCanGoForward(state.canGoForward);
              setInputUrl(state.url);
            }}
            javaScriptEnabled
            domStorageEnabled
          />
        ) : (
          <View style={styles.pausedOverlay}>
            <Ionicons name="pause-circle" size={64} color="#555" />
            <Text style={styles.pausedText}>Browser Paused</Text>
            <Text style={styles.pausedSub}>Resume to continue browsing</Text>
          </View>
        )}
      </View>

      {/* Control Buttons */}
      <View style={styles.controlBar}>
        <TouchableOpacity
          style={[styles.controlBtn, paused && styles.controlBtnActive]}
          onPress={() => setPaused(true)}
        >
          <Ionicons name="pause" size={18} color={paused ? '#0a0a0a' : '#00d4ff'} />
          <Text style={[styles.controlBtnText, paused && styles.controlBtnTextActive]}>Pause</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => webviewRef.current?.stopLoading()}
        >
          <Ionicons name="stop" size={18} color="#ff4444" />
          <Text style={[styles.controlBtnText, { color: '#ff4444' }]}>Stop</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, !paused && styles.controlBtnActive]}
          onPress={() => setPaused(false)}
        >
          <Ionicons name="play" size={18} color={!paused ? '#0a0a0a' : '#00d4ff'} />
          <Text style={[styles.controlBtnText, !paused && styles.controlBtnTextActive]}>Resume</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  urlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 4,
  },
  navBtn: {
    padding: 6,
    borderRadius: 8,
  },
  navBtnDisabled: { opacity: 0.4 },
  urlInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    color: '#fff',
    fontSize: 14,
  },
  webviewContainer: { flex: 1 },
  webview: { flex: 1 },
  pausedOverlay: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pausedText: { color: '#888', fontSize: 18, fontWeight: '600' },
  pausedSub: { color: '#444', fontSize: 14 },
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#333',
    backgroundColor: 'transparent',
  },
  controlBtnActive: {
    backgroundColor: '#00d4ff',
    borderColor: '#00d4ff',
  },
  controlBtnText: { color: '#00d4ff', fontSize: 14, fontWeight: '600' },
  controlBtnTextActive: { color: '#0a0a0a' },
});
