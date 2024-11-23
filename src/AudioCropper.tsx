import {
  AudioOutlined,
  DownloadOutlined,
  InboxOutlined,
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

const { Dragger } = Upload;
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
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [croppedAudioUrl, setCroppedAudioUrl] = useState<string>('');
  const [isFFmpegLoaded, setIsFFmpegLoaded] = useState<boolean>(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 初始化 FFmpeg（之前的代码保持不变）
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpeg = new FFmpeg();
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/esm';

        ffmpeg.on('log', ({ message }) => {
          console.log('FFmpeg log:', message);
        });

        ffmpeg.on('progress', ({ progress }) => {
          console.log('FFmpeg progress:', progress);
        });

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

  // 文件上传处理
  const handleFileUpload = (file: RcFile) => {
    if (file.size > maxFileSize) {
      message.error(`文件大小不能超过 ${maxFileSize / 1024 / 1024}MB`);
      return false;
    }

    const url = URL.createObjectURL(file);
    setAudioFile({ file, url, duration: 0 });

    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setAudioFile((prev) => ({ ...prev, duration: audio.duration }));
      setEndTime(audio.duration);
    };

    return false; // 阻止默认上传行为
  };

  // 音频裁剪处理（之前的代码保持不变）
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
        `${startTime}`,
        '-to',
        `${endTime}`,
        '-c',
        'copy',
        'output.mp3',
      ]);

      const fileExists = await ffmpeg.readFile('output.mp3').catch(() => null);

      if (!fileExists) {
        throw new Error('裁剪后的文件未生成');
      }

      const data = await ffmpeg.readFile('output.mp3');
      const blob = new Blob([data.buffer], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);

      setCroppedAudioUrl(url);
      message.success('音频裁剪成功');
    } catch (error) {
      console.error('裁剪失败', error);
      message.error(
        `音频裁剪出现错误: ${error instanceof Error ? error.message : '未知错误'}`,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // 下载裁剪后的音频
  const downloadCroppedAudio = () => {
    if (!croppedAudioUrl) return;

    const link = document.createElement('a');
    link.href = croppedAudioUrl;
    link.download = 'cropped_audio.mp3';
    link.click();
  };

  return (
    <Card title="音频裁剪工具" style={{ width: 800, margin: '0 auto' }}>
      <Dragger
        name="audio"
        accept=".mp3,.wav,.ogg,.m4a"
        multiple={false}
        beforeUpload={handleFileUpload}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽音频文件到此区域上传</p>
      </Dragger>

      {audioFile.file && (
        <Card style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Title level={5}>音频预览</Title>
            <audio
              ref={audioRef}
              src={audioFile.url}
              controls
              style={{ width: '100%' }}
            />

            <Row gutter={16}>
              <Col span={12}>
                <Text>开始时间（秒）</Text>
                <Slider
                  min={0}
                  max={endTime}
                  value={startTime}
                  onChange={(value) => setStartTime(value)}
                />
              </Col>
              <Col span={12}>
                <Text>结束时间（秒）</Text>
                <Slider
                  min={startTime}
                  max={audioFile.duration}
                  value={endTime}
                  onChange={(value) => setEndTime(value)}
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
        <Card style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Title level={5}>裁剪结果</Title>
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
