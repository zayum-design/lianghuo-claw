import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import zhCN from 'antd/locale/zh_CN'
import { RouterProvider } from 'react-router-dom'

import { ConfigProvider } from 'antd'

import router from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
    mutations: {
      onError: (error) => {
        // 全局错误处理，将在后续Task中集成Ant Design message
        console.error('Mutation error:', error)
      },
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        componentSize="small"
        theme={{
          token: {
            colorBgContainer: '#242424',
            colorBgElevated: '#2a2a2a',
            colorBgLayout: '#1a1a1a',
            colorPrimary: '#00d4ff',
            colorBorder: '#333333',
            colorText: '#ffffff',
            colorTextSecondary: '#999999',
            borderRadius: 6,
          },
          components: {
            // 组件特定样式覆盖
          },
        }}
      >
        <div id="app" className="min-h-screen bg-background-primary text-text-primary">
          <RouterProvider router={router} />
        </div>
      </ConfigProvider>
    </QueryClientProvider>
  )
}

export default App
