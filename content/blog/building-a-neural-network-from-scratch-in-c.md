---
title: 'Building a Neural Network from Scratch in C'
date: '2026-10-15'
description: 'Exploring the mechanics of neural computation, forward propagation, and backpropagation in pure C without external machine learning frameworks.'
---

Modern machine learning frameworks like PyTorch and TensorFlow abstract away the foundational mechanics of neural computation. To understand how weights, biases, activations, and gradient updates work at the lowest level, I implemented a feedforward neural network completely from scratch in pure C.

## Motivation

When working with high-level Python libraries, training a model often boils down to a few lines of code: defining layers, calling `.backward()`, and stepping an optimizer. While convenient for production systems and rapid experimentation, it obscures the underlying linear algebra and calculus:

- How memory is allocated and managed for weight matrices and activations
- How matrix multiplications and activation functions execute sequentially
- How gradients are calculated through chain rule backpropagation across layers
- How numerical stability is maintained during optimization

Implementing this in C forces you to address all of these questions directly.

## Architecture

The network implements a modular multi-layer perceptron (MLP) architecture:

1. **Layer Representation**: Each layer maintains pointers to its weight matrix, bias vector, activation values, and gradient accumulators.
2. **Forward Propagation**: Matrix multiplication followed by element-wise activation functions (such as Sigmoid and ReLU).
3. **Loss Computation**: Mean squared error (MSE) or cross-entropy loss measuring output error.
4. **Backpropagation**: Explicit implementation of the chain rule to compute partial derivatives of the loss with respect to every weight and bias.
5. **Parameter Updates**: Stochastic gradient descent (SGD) updating parameters based on computed gradients and a learning rate.

## Implementation Details

In C, multidimensional arrays are flattened into contiguous 1D memory blocks for cache locality and efficient indexing:

```c
// Forward pass: Z = W * X + B
void dense_forward(const float *weights, const float *inputs,
                   const float *biases, float *outputs,
                   int input_dim, int output_dim) {
    for (int i = 0; i < output_dim; i++) {
        float sum = biases[i];
        for (int j = 0; j < input_dim; j++) {
            sum += weights[i * input_dim + j] * inputs[j];
        }
        outputs[i] = sigmoid(sum);
    }
}
```

The backward pass computes the local derivative of the activation function and propagates error backwards through transposed weight matrices.

## Key Takeaways

1. **Memory efficiency**: Without Python runtime overhead, forward and backward passes execute with minimal memory footprint.
2. **Deep understanding**: Walking through manual matrix derivatives demystifies how automatic differentiation libraries function under the hood.
3. **Performance considerations**: Profiling reveals that cache-friendly memory access patterns and loop order significantly impact training throughput.

This project provided a solid foundation in neural computation that directly informs my higher-level work in machine learning and agentic workflows.
