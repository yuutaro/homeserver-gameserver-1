FROM nvidia/cuda@sha256:ac55d124da4882b497f732d8dfd9a702d5447a5f29d08d56da6f64f0a1eb34bc AS cuda
FROM itzg/minecraft-server@sha256:4b6a75fd5cbca70ca3580ae8c0ea67286dd99c303554bb57e95bb2bade32f428

COPY --from=cuda /usr/local/cuda-12.8/ /usr/local/cuda-12.8/
COPY --from=cuda /usr/lib/x86_64-linux-gnu/libcudnn*.so* /usr/lib/x86_64-linux-gnu/

RUN ln -s /usr/local/cuda-12.8 /usr/local/cuda

ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:/usr/lib/x86_64-linux-gnu
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

LABEL org.opencontainers.image.title="Minecraft Server Java 21 with CUDA 12.8 and cuDNN 9"
