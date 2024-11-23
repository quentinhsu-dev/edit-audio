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
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [croppedAudioUrl, setCroppedAudioUrl] = useState<string>('');
  const [isFFmpegLoaded, setIsFFmpegLoaded] = useState<boolean>(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);

  // 初始化 FFmpeg
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

  // 初始化 WaveSurfer
  useEffect(() => {
    if (audioFile.url) {
      // 销毁之前的实例
      if (waveSurferRef.current) {
        waveSurferRef.current.destroy();
      }

      const regionsPlugin = RegionsPlugin.create();
      regionsPlugin.on('region-updated', (region) => {
        console.log('Updated region', region);
        setStartTime(preserveDecimals(region.start));
        setEndTime(preserveDecimals(region.end));
      });
      // 创建新的 WaveSurfer 实例并加载 regions 插件
      const waveSurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#d9dcff',
        progressColor: '#4a90e2',
        cursorColor: '#ff0000',
        height: 100,
        barWidth: 2,
        // responsive: true,
        plugins: [regionsPlugin],
      });

      waveSurfer.load(audioFile.url);

      waveSurfer.on('ready', () => {
        const duration = waveSurfer.getDuration();
        // setAudioFile((prev) => ({ ...prev, duration }));
        setEndTime(preserveDecimals(duration));
      });

      // 监听 Region 更新
      // waveSurfer.on('region-update-end', (region) => {
      //   setStartTime(region.start);
      //   setEndTime(region.end);
      // });
      const random = (min: number, max: number) =>
        Math.random() * (max - min) + min;
      const randomColor = () =>
        `rgba(${random(0, 255)}, ${random(0, 255)}, ${random(0, 255)}, 0.5)`;
      waveSurfer.on('decode', () => {
        regionsPlugin.addRegion({
          start: 0,
          end: 8,
          content: 'Resize or drag me!',
          color: randomColor(),
          drag: true,
          resize: true,
        });
      });

      waveSurferRef.current = waveSurfer;
    }
  }, [audioFile.url]);

  // 文件上传处理
  const handleFileUpload = (file: RcFile) => {
    if (file.size > maxFileSize) {
      message.error(`文件大小不能超过 ${maxFileSize / 1024 / 1024}MB`);
      return false;
    }

    const url = URL.createObjectURL(file);
    setAudioFile({ file, url, duration: 0 });

    return false; // 阻止默认上传行为
  };

  // 音频裁剪处理
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
      const blob = new Blob([data], { type: 'audio/mp3' });
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

  // 更新 Region 的 start 和 end
  const updateRegion = (start: number, end: number) => {
    console.log('updateRegion', start, end);
    const waveSurfer = waveSurferRef.current;
    const region = waveSurfer?.regions.list['selection'];
    if (region) {
      region.update({ start, end });
    }
  };

  return (
    <Card title="音频裁剪工具" style={{ width: 800, textAlign: 'left' }}>
      <Upload
        name="audio"
        accept=".mp3,.wav,.ogg,.m4a"
        multiple={false}
        beforeUpload={handleFileUpload}
      >
        <Button icon={<UploadOutlined />}>选取文件</Button>
      </Upload>

      {audioFile.file && (
        <Card style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Title level={5}>音频波形图</Title>
            <div id="waveform" style={{ width: '100%' }} />
            <Row gutter={16}>
              <Col span={12}>
                <Text>开始时间（秒）:{startTime}</Text>
                {/* <Slider
                  min={0}
                  max={audioFile.duration}
                  value={startTime}
                  onChange={(value) => {
                    setStartTime(value);
                    updateRegion(value, endTime);
                  }}
                /> */}
              </Col>
              <Col span={12}>
                <Text>结束时间（秒）: {endTime}</Text>
                {/* <Slider
                  min={startTime}
                  max={audioFile.duration}
                  value={endTime}
                  onChange={(value) => {
                    setEndTime(preserveDecimals(value));
                    updateRegion(startTime, value);
                  }}
                /> */}
              </Col>
              <Col span={24}>
                <Slider
                  range={true}
                  min={startTime}
                  max={audioFile.duration}
                  value={[startTime, endTime]}
                  onChange={([start, end]) => {
                    setStartTime(preserveDecimals(start));
                    setEndTime(preserveDecimals(end));
                    updateRegion(start, end);
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
