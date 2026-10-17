## Shadcn Colors

```css
@layer base {
  :root {
    /* Light Mode Fallback */
    --background: 0 0% 100%;
    --foreground: 231 15% 18%;

    --card: 0 0% 100%;
    --card-foreground: 231 15% 18%;

    --popover: 0 0% 100%;
    --popover-foreground: 231 15% 18%;

    --primary: 326 100% 74%; /* Pink #FF79C6 */
    --primary-foreground: 0 0% 100%;

    --secondary: 250 100% 80%; /* Purple #BD93F9 */
    --secondary-foreground: 231 15% 18%;

    --muted: 225 15% 93%;
    --muted-foreground: 225 27% 51%;

    --accent: 135 94% 65%; /* Green #50FA7B */
    --accent-foreground: 231 15% 18%;

    --destructive: 0 100% 67%; /* Red #FF5555 */
    --destructive-foreground: 0 0% 100%;

    --border: 225 15% 85%;
    --input: 225 15% 85%;
    --ring: 326 100% 74%;

    --radius: 0.5rem;
  }

  .dark {
    /* Illusion Refined Dark Mode */
    --background: 231 15% 18%; /* Dark Slate #282A36 */
    --foreground: 60 30% 96%; /* Bright Off-White #F8F8F2 */

    --card: 231 15% 15%; /* Darker Slate #21222C */
    --card-foreground: 60 30% 96%;

    --popover: 231 15% 15%;
    --popover-foreground: 60 30% 96%;

    --primary: 326 100% 74%; /* Pink #FF79C6 */
    --primary-foreground: 231 15% 18%;

    --secondary: 265 89% 78%; /* Purple #BD93F9 */
    --secondary-foreground: 231 15% 18%;

    --muted: 225 27% 31%; /* Line Highlight / Dark Grey-Blue #44475A */
    --muted-foreground: 225 27% 65%; /* Comment Grey #6272A4 */

    --accent: 191 97% 77%; /* Cyan #8BE9FD */
    --accent-foreground: 231 15% 18%;

    --destructive: 0 100% 67%; /* Red #FF5555 */
    --destructive-foreground: 60 30% 96%;

    --border: 225 27% 31%; /* #44475A */
    --input: 225 27% 31%;
    --ring: 326 100% 74%; /* Pink Glow */
  }
}
```

## Color Table

| Role                    | Hex       | Color Name          |
| :---------------------- | :-------- | :------------------ |
| **Background**          | `#282A36` | Dark Slate Blue     |
| **Cards / Popovers**    | `#21222C` | Deep Slate          |
| **Muted / Borders**     | `#44475A` | Selection Blue-Grey |
| **Foreground / Text**   | `#F8F8F2` | Off-white           |
| **Primary Accent**      | `#FF79C6` | Pink                |
| **Secondary Accent**    | `#BD93F9` | Purple              |
| **Cyan Accent**         | `#8BE9FD` | Soft Cyan           |
| **Green / Success**     | `#50FA7B` | Vibrant Green       |
| **Warning / Numbers**   | `#FFB86C` | Soft Orange         |
| **Destructive / Error** | `#FF5555` | Vibrant Red         |
