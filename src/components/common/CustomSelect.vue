<template>
  <div class="custom-select" :class="{ open: isOpen }" ref="selectRef">
    <div class="select-trigger" @click="openDropdown">
      <input
        ref="inputRef"
        type="text"
        class="select-input"
        v-model="searchText"
        :placeholder="selectedLabel || placeholder"
        @focus="openDropdown"
        @input="onInput"
        @keydown.down.prevent="navigateDown"
        @keydown.up.prevent="navigateUp"
        @keydown.enter.prevent="selectHighlighted"
        @keydown.escape="closeDropdown"
      />
      <ChevronDown :size="14" class="select-arrow" />
    </div>
    <div v-if="isOpen" class="select-dropdown">
      <div
        v-for="(option, index) in filteredOptions"
        :key="option.value"
        class="select-option"
        :class="{ selected: option.value === modelValue, highlighted: index === highlightedIndex }"
        @click="selectOption(option)"
        @mouseenter="highlightedIndex = index"
      >
        {{ option.label }}
      </div>
      <div v-if="filteredOptions.length === 0" class="select-empty">
        无匹配项
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  options: {
    type: Array,
    default: () => []
    // 格式: [{ value: 'xxx', label: 'XXX' }] 或 ['xxx', 'yyy']
  },
  placeholder: {
    type: String,
    default: '请选择'
  }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const selectRef = ref(null)
const inputRef = ref(null)
const searchText = ref('')
const highlightedIndex = ref(0)

// 标准化 options
const normalizedOptions = computed(() => {
  return props.options.map(opt => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt }
    }
    return opt
  })
})

// 筛选后的选项
const filteredOptions = computed(() => {
  if (!searchText.value.trim()) {
    return normalizedOptions.value
  }
  const keyword = searchText.value.toLowerCase().trim()
  return normalizedOptions.value.filter(opt => 
    opt.label.toLowerCase().includes(keyword) || 
    opt.value.toLowerCase().includes(keyword)
  )
})

// 获取选中项的标签
const selectedLabel = computed(() => {
  const found = normalizedOptions.value.find(opt => opt.value === props.modelValue)
  return found ? found.label : ''
})

const openDropdown = () => {
  isOpen.value = true
  highlightedIndex.value = 0
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const closeDropdown = () => {
  isOpen.value = false
  searchText.value = ''
  highlightedIndex.value = 0
}

const onInput = () => {
  if (!isOpen.value) {
    isOpen.value = true
  }
  highlightedIndex.value = 0
}

const selectOption = (option) => {
  emit('update:modelValue', option.value)
  closeDropdown()
}

const navigateDown = () => {
  if (highlightedIndex.value < filteredOptions.value.length - 1) {
    highlightedIndex.value++
  }
}

const navigateUp = () => {
  if (highlightedIndex.value > 0) {
    highlightedIndex.value--
  }
}

const selectHighlighted = () => {
  if (filteredOptions.value.length > 0 && highlightedIndex.value >= 0) {
    selectOption(filteredOptions.value[highlightedIndex.value])
  }
}

// 点击外部关闭
const handleClickOutside = (event) => {
  if (selectRef.value && !selectRef.value.contains(event.target)) {
    closeDropdown()
  }
}

// 监听 modelValue 变化，更新显示
watch(() => props.modelValue, () => {
  searchText.value = ''
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.custom-select {
  position: relative;
  width: 100%;
}

.select-trigger {
  display: flex;
  align-items: center;
  background: #2a2a2a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.custom-select.open .select-trigger {
  border-color: #0066ff;
}

.select-input {
  flex: 1;
  padding: 10px 12px;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.select-input::placeholder {
  color: rgba(255, 255, 255, 0.8);
}

.select-arrow {
  color: rgba(255, 255, 255, 0.6);
  transition: transform 0.2s;
  flex-shrink: 0;
  margin-right: 12px;
}

.custom-select.open .select-arrow {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: #2a2a2a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.select-option {
  padding: 10px 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: background 0.15s;
}

.select-option:hover,
.select-option.highlighted {
  background: rgba(255, 255, 255, 0.1);
}

.select-option.selected {
  background: rgba(0, 102, 255, 0.2);
  color: #0099ff;
}

.select-option.selected.highlighted {
  background: rgba(0, 102, 255, 0.3);
}

.select-empty {
  padding: 16px 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
}

/* 滚动条样式 */
.select-dropdown::-webkit-scrollbar {
  width: 6px;
}

.select-dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.select-dropdown::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.select-dropdown::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
