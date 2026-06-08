// Package config implements a typed config registry. Each business module
// defines a settings struct, declares its defaults, and registers a pointer
// to its singleton with GlobalConfig at init() time. The manager handles
// load-from-DB / save-to-DB via reflection over json tags, so adding a new
// module is one file with no central switch to edit.
//
// Storage convention: each struct field maps to one row in the option table
// keyed as "<module_name>.<json_tag>". Scalars are stored as strings;
// composite types (slice / map / struct / pointer) as JSON.
//
// Ported from QuantumNous/new-api setting/config/config.go — kept
// behaviour-compatible so future cherry-picks of new-api module ports drop
// in unchanged.
package config

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"sync"

	"github.com/songquanpeng/one-api/common/logger"
)

// logDecodeFailure surfaces per-field decode failures that would
// otherwise be silently skipped. Without this, an admin could save a
// malformed dotted option, see "success" in the UI, and the runtime
// would silently ignore it forever. We log instead of returning an
// error so a single bad field doesn't block the whole module's load.
func logDecodeFailure(key, kind, value string, err error) {
	snippet := value
	if len(snippet) > 80 {
		snippet = snippet[:80] + "..."
	}
	logger.SysError(fmt.Sprintf("config: decode failed for %s field %q value %q: %s", kind, key, snippet, err.Error()))
}

// ConfigManager is the registry of typed settings modules.
type ConfigManager struct {
	configs map[string]interface{}
	mutex   sync.RWMutex
}

// GlobalConfig is the process-wide registry. Settings modules register
// themselves here in init().
var GlobalConfig = NewConfigManager()

func NewConfigManager() *ConfigManager {
	return &ConfigManager{
		configs: make(map[string]interface{}),
	}
}

// Register adds a settings module under name. config must be a pointer to
// the module's singleton struct so updates are visible to all callers.
func (cm *ConfigManager) Register(name string, config interface{}) {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()
	cm.configs[name] = config
}

// Get returns the registered config pointer for name (or nil if unknown).
// Callers should type-assert to the module's struct pointer.
func (cm *ConfigManager) Get(name string) interface{} {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()
	return cm.configs[name]
}

// LoadFromDB walks every registered module, picks out the rows of `options`
// whose key starts with "<module>.", and reflectively applies them. Keys
// outside the registered prefixes (legacy flat config) are ignored.
func (cm *ConfigManager) LoadFromDB(options map[string]string) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	for name, config := range cm.configs {
		prefix := name + "."
		configMap := make(map[string]string)

		for key, value := range options {
			if strings.HasPrefix(key, prefix) {
				configKey := strings.TrimPrefix(key, prefix)
				configMap[configKey] = value
			}
		}

		if len(configMap) > 0 {
			if err := updateConfigFromMap(config, configMap); err != nil {
				logger.SysError("failed to update config " + name + ": " + err.Error())
				continue
			}
		}
	}

	return nil
}

// SaveToDB calls updateFunc("<module>.<field>", stringValue) for every
// field of every registered module. The caller decides what "save" means
// (write to DB, copy into OptionMap, push to an audit log, etc.).
func (cm *ConfigManager) SaveToDB(updateFunc func(key, value string) error) error {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	for name, config := range cm.configs {
		configMap, err := configToMap(config)
		if err != nil {
			return err
		}
		for key, value := range configMap {
			dbKey := name + "." + key
			if err := updateFunc(dbKey, value); err != nil {
				return err
			}
		}
	}
	return nil
}

// ExportAllConfigs returns the current snapshot of every registered module
// flattened to "<module>.<field>" keys. Used to seed OptionMap and to feed
// the admin GET /option/ endpoint.
func (cm *ConfigManager) ExportAllConfigs() map[string]string {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	result := make(map[string]string)
	for name, cfg := range cm.configs {
		configMap, err := configToMap(cfg)
		if err != nil {
			continue
		}
		for key, value := range configMap {
			result[name+"."+key] = value
		}
	}
	return result
}

// ConfigToMap is the exported entrypoint for one-off marshalling.
func ConfigToMap(config interface{}) (map[string]string, error) {
	return configToMap(config)
}

// UpdateConfigFromMap is the exported entrypoint for one-off unmarshalling.
func UpdateConfigFromMap(config interface{}, configMap map[string]string) error {
	return updateConfigFromMap(config, configMap)
}

func configToMap(config interface{}) (map[string]string, error) {
	result := make(map[string]string)

	val := reflect.ValueOf(config)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return nil, nil
	}

	typ := val.Type()
	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)
		fieldType := typ.Field(i)

		if !fieldType.IsExported() {
			continue
		}

		key := fieldType.Tag.Get("json")
		if key == "" || key == "-" {
			key = fieldType.Name
		}
		// Strip ",omitempty" etc.
		if comma := strings.Index(key, ","); comma >= 0 {
			key = key[:comma]
		}

		var strValue string
		switch field.Kind() {
		case reflect.String:
			strValue = field.String()
		case reflect.Bool:
			strValue = strconv.FormatBool(field.Bool())
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			strValue = strconv.FormatInt(field.Int(), 10)
		case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			strValue = strconv.FormatUint(field.Uint(), 10)
		case reflect.Float32, reflect.Float64:
			strValue = strconv.FormatFloat(field.Float(), 'f', -1, 64)
		case reflect.Ptr:
			if !field.IsNil() {
				bytes, err := json.Marshal(field.Interface())
				if err != nil {
					return nil, err
				}
				strValue = string(bytes)
			} else {
				strValue = "null"
			}
		case reflect.Map, reflect.Slice, reflect.Struct:
			bytes, err := json.Marshal(field.Interface())
			if err != nil {
				return nil, err
			}
			strValue = string(bytes)
		default:
			continue
		}

		result[key] = strValue
	}

	return result, nil
}

func updateConfigFromMap(config interface{}, configMap map[string]string) error {
	val := reflect.ValueOf(config)
	if val.Kind() != reflect.Ptr {
		return nil
	}
	val = val.Elem()
	if val.Kind() != reflect.Struct {
		return nil
	}

	typ := val.Type()
	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)
		fieldType := typ.Field(i)

		if !fieldType.IsExported() {
			continue
		}

		key := fieldType.Tag.Get("json")
		if key == "" || key == "-" {
			key = fieldType.Name
		}
		if comma := strings.Index(key, ","); comma >= 0 {
			key = key[:comma]
		}

		strValue, ok := configMap[key]
		if !ok {
			continue
		}
		if !field.CanSet() {
			continue
		}

		switch field.Kind() {
		case reflect.String:
			field.SetString(strValue)
		case reflect.Bool:
			boolValue, err := strconv.ParseBool(strValue)
			if err != nil {
				logDecodeFailure(key, "bool", strValue, err)
				continue
			}
			field.SetBool(boolValue)
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			intValue, err := strconv.ParseInt(strValue, 10, 64)
			if err != nil {
				// Tolerate float-encoded ints like "2.000000" from older op
				// tables, otherwise we'd silently zero the field on re-load.
				floatValue, fErr := strconv.ParseFloat(strValue, 64)
				if fErr != nil {
					logDecodeFailure(key, "int", strValue, err)
					continue
				}
				intValue = int64(floatValue)
			}
			field.SetInt(intValue)
		case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			uintValue, err := strconv.ParseUint(strValue, 10, 64)
			if err != nil {
				floatValue, fErr := strconv.ParseFloat(strValue, 64)
				if fErr != nil || floatValue < 0 {
					logDecodeFailure(key, "uint", strValue, err)
					continue
				}
				uintValue = uint64(floatValue)
			}
			field.SetUint(uintValue)
		case reflect.Float32, reflect.Float64:
			floatValue, err := strconv.ParseFloat(strValue, 64)
			if err != nil {
				logDecodeFailure(key, "float", strValue, err)
				continue
			}
			field.SetFloat(floatValue)
		case reflect.Ptr:
			if strValue == "null" {
				field.Set(reflect.Zero(field.Type()))
			} else {
				if field.IsNil() {
					field.Set(reflect.New(field.Type().Elem()))
				}
				if err := json.Unmarshal([]byte(strValue), field.Interface()); err != nil {
					logDecodeFailure(key, "ptr-json", strValue, err)
					continue
				}
			}
		case reflect.Map:
			// json.Unmarshal merges into existing maps (keeps old keys absent
			// from the new JSON). Allocate fresh so removed keys are cleared.
			fresh := reflect.New(field.Type())
			if err := json.Unmarshal([]byte(strValue), fresh.Interface()); err != nil {
				logDecodeFailure(key, "map-json", strValue, err)
				continue
			}
			field.Set(fresh.Elem())
		case reflect.Slice, reflect.Struct:
			if err := json.Unmarshal([]byte(strValue), field.Addr().Interface()); err != nil {
				logDecodeFailure(key, "json", strValue, err)
				continue
			}
		}
	}

	return nil
}
