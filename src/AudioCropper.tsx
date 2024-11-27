import {
  AudioOutlined,
  DownloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import {
  Button,
  Card,
  Col,
  Row,
  Slider,
  Space,
  Typography,
  Upload,
  message,
} from 'antd';
import type { RcFile } from 'antd/es/upload';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { preserveDecimals } from './utils';

const { Title, Text } = Typography;

interface AudioCropperProps {
  maxFileSize?: number;
}

interface AudioFileState {
  file: File | null;
  duration: number;
  url: string;
}

const AudioCropper: React.FC<AudioCropperProps> = ({
  maxFileSize = 10 * 1024 * 1024,
}) => {
  const [audioFile, setAudioFile] = useState<AudioFileState>({
    file: null,
    duration: 0,
    url: '',
  });
  const [originalAudioFile, setOriginalAudioFile] = useState<AudioFileState>({
    file: null,
    duration: 0,
    url: '',
  });
  const [range, setRange] = useState<number[]>([0, 9]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [croppedAudioUrl, setCroppedAudioUrl] = useState<string>('');
  const [isFFmpegLoaded, setIsFFmpegLoaded] = useState<boolean>(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpeg = new FFmpeg();
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/esm';

        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            'text/javascript',
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            'application/wasm',
          ),
        });

        ffmpegRef.current = ffmpeg;
        setIsFFmpegLoaded(true);
      } catch (error) {
        console.error('FFmpeg 加载失败:', error);
        message.error('FFmpeg 初始化错误，音频裁剪功能可能不可用');
      }
    };

    loadFFmpeg();
  }, []);

  useEffect(() => {
    if (originalAudioFile.url) {
      if (waveSurferRef.current) {
        waveSurferRef.current.destroy();
      }

      // Create regions plugin
      regionsPluginRef.current = RegionsPlugin.create();
      regionsPluginRef.current.on('region-updated', (region) => {
        setRange([
          preserveDecimals(region.start),
          preserveDecimals(region.end),
        ]);
      });

      const waveSurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#d9dcff',
        progressColor: '#4a90e2',
        cursorColor: '#ff0000',
        cursorWidth: 0,
        height: 100,
        barWidth: 2,
        plugins: [regionsPluginRef.current],
        interact: false,
      });

      waveSurfer.load(originalAudioFile.url);

      waveSurfer.on('ready', () => {
        const duration = waveSurfer.getDuration();
        setRange([0, duration]);
        setAudioFile((prev) => ({ ...prev, duration }));
        setOriginalAudioFile((prev) => ({ ...prev, duration }));
      });

      waveSurfer.on('decode', () => {
        if (regionsPluginRef.current) {
          regionsPluginRef.current.addRegion({
            id: 'region',
            start: 0,
            end: waveSurfer.getDuration(),
            content: 'Resize or drag me!',
            color: `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.5)`,
            drag: true,
            resize: true,
          });
        }
      });

      waveSurferRef.current = waveSurfer;
    }
  }, [originalAudioFile.url]);

  const handleFileUpload = (file: RcFile) => {
    if (file.size > maxFileSize) {
      message.error(`文件大小不能超过 ${maxFileSize / 1024 / 1024}MB`);
      return false;
    }

    const url = URL.createObjectURL(file);
    setOriginalAudioFile({ file, url, duration: 0 });
    setAudioFile({ file, url, duration: 0 });

    return false;
  };

  const handleCrop = async () => {
    if (!audioFile.file || !ffmpegRef.current || !isFFmpegLoaded) {
      message.error('FFmpeg未完全加载或未选择文件');
      return;
    }

    setIsProcessing(true);

    try {
      const ffmpeg = ffmpegRef.current;
      const fileBuffer = await audioFile.file.arrayBuffer();

      await ffmpeg.writeFile('input.mp3', new Uint8Array(fileBuffer));

      await ffmpeg.exec([
        '-i',
        'input.mp3',
        '-ss',
        `${range[0]}`,
        '-to',
        `${range[1]}`,
        '-c',
        'copy',
        'output.mp3',
      ]);

      const data = await ffmpeg.readFile('output.mp3');
      const blob = new Blob([data], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);

      setCroppedAudioUrl(url);
      message.success('音频裁剪成功');
    } catch (error) {
      console.error('裁剪失败', error);
      message.error('音频裁剪失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCroppedAudio = () => {
    if (!croppedAudioUrl) return;

    const link = document.createElement('a');
    link.href = croppedAudioUrl;
    link.download = 'cropped_audio.mp3';
    link.click();
  };

  return (
    <Card title="音频裁剪工具" style={{ width: 800, textAlign: 'left' }}>
      <Upload
        name="audio"
        accept=".mp3,.wav,.ogg,.m4a"
        maxCount={1}
        multiple={false}
        beforeUpload={handleFileUpload}
      >
        <Button icon={<UploadOutlined />}>选取文件</Button>
      </Upload>

      {originalAudioFile.file && (
        <Card style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div id="waveform" style={{ width: '100%' }} />
            <Row gutter={16}>
              <Col span={12}>
                <Text>开始时间（秒）:{range[0]}</Text>
              </Col>
              <Col span={12}>
                <Text>结束时间（秒）: {range[1]}</Text>
              </Col>
              <Col span={24}>
                <Slider
                  range={{ draggableTrack: true }}
                  step={0.01}
                  min={0}
                  max={originalAudioFile.duration}
                  value={range}
                  onChange={(value: number[]) => {
                    setRange([value[0], value[1]]);
                    // biome-ignore lint/complexity/noForEach: <explanation>
                    regionsPluginRef.current?.getRegions().forEach((region) => {
                      region.setOptions({
                        start: range[0],
                        end: range[1],
                      });
                    });
                  }}
                />
              </Col>
            </Row>
            <Button
              type="primary"
              icon={<AudioOutlined />}
              onClick={handleCrop}
              loading={isProcessing}
              disabled={!isFFmpegLoaded}
            >
              裁剪音频
            </Button>
          </Space>
        </Card>
      )}

      {croppedAudioUrl && (
        <Card title={'裁剪结果'} style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {/* biome-ignore lint/a11y/useMediaCaption: <explanation> */}
            <audio src={croppedAudioUrl} controls style={{ width: '100%' }} />
            <Button
              type="default"
              icon={<DownloadOutlined />}
              onClick={downloadCroppedAudio}
            >
              下载裁剪后的音频
            </Button>
          </Space>
        </Card>
      )}
    </Card>
  );
};

export default AudioCropper;
