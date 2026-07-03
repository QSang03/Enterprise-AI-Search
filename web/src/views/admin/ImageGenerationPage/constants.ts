export interface ImageProvider {
  image_provider_id: string; // Static unique key for UI-DB mapping
  model_name: string; // Actual model name for LLM API
  provider_name: string;
  title: string;
  description: string;
}

export interface ProviderGroup {
  name: string;
  providers: ImageProvider[];
}

export const IMAGE_PROVIDER_GROUPS: ProviderGroup[] = [
  {
    name: "OpenAI",
    providers: [
      {
        image_provider_id: "openai_gpt_image_2",
        model_name: "gpt-image-2",
        provider_name: "openai",
        title: "GPT Image 2",
        description:
          "Mẫu tạo ảnh mới nhất của OpenAI với độ bám sát mô tả (prompt fidelity) cao nhất.",
      },
      {
        image_provider_id: "openai_gpt_image_1_5",
        model_name: "gpt-image-1.5",
        provider_name: "openai",
        title: "GPT Image 1.5",
        description: "Mẫu tạo ảnh flagship trước đây của OpenAI.",
      },
      {
        image_provider_id: "openai_gpt_image_1",
        model_name: "gpt-image-1",
        provider_name: "openai",
        title: "GPT Image 1",
        description:
          "Mẫu tạo ảnh mạnh mẽ từ OpenAI với khả năng tuân thủ mô tả (prompt adherence) tốt.",
      },
    ],
  },
  {
    name: "Azure OpenAI",
    providers: [
      {
        image_provider_id: "azure_gpt_image_2",
        model_name: "", // Extracted from deployment in target URI
        provider_name: "azure",
        title: "Azure OpenAI GPT Image 2",
        description:
          "Mẫu tạo ảnh GPT Image 2 được cung cấp trên Microsoft Azure.",
      },
      {
        image_provider_id: "azure_gpt_image_1_5",
        model_name: "", // Extracted from deployment in target URI
        provider_name: "azure",
        title: "Azure OpenAI GPT Image 1.5",
        description:
          "Mẫu tạo ảnh GPT Image 1.5 được cung cấp trên Microsoft Azure.",
      },
      {
        image_provider_id: "azure_gpt_image_1",
        model_name: "", // Extracted from deployment in target URI
        provider_name: "azure",
        title: "Azure OpenAI GPT Image 1",
        description:
          "Mẫu tạo ảnh GPT Image 1 được cung cấp trên Microsoft Azure.",
      },
    ],
  },
  {
    name: "Google Cloud Vertex AI",
    providers: [
      {
        image_provider_id: "gemini-2.5-flash-image",
        model_name: "gemini-2.5-flash-image",
        provider_name: "vertex_ai",
        title: "Gemini 2.5 Flash Image",
        description:
          "Mẫu Gemini 2.5 Flash Image (Nano Banana) được thiết kế cho tốc độ và hiệu suất tối đa.",
      },
      {
        image_provider_id: "gemini-3-pro-image-preview",
        model_name: "gemini-3-pro-image-preview",
        provider_name: "vertex_ai",
        title: "Gemini 3 Pro Image Preview",
        description:
          "Gemini 3 Pro Image Preview (Nano Banana Pro) được thiết kế cho việc sản xuất hình ảnh tài nguyên chuyên nghiệp.",
      },
    ],
  },
];
