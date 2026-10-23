import { createCn } from 'cn/config'

// Teach the merger that these text-* tokens are sizes, not foreground colours.
export const cn = createCn({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'micro',
            'bar',
            'caption',
            'body',
            'control',
            'subtitle',
            'title',
            'page',
            'clock-display',
            'studio-display'
          ]
        }
      ]
    }
  }
})
